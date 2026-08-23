use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashMap, HashSet};

use deadpool_postgres::Pool;

use crate::error::AppError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SecurityClass {
    HighSec,
    LowSec,
    NullSec,
}

impl SecurityClass {
    fn from_status(security_status: f64) -> Self {
        if security_status >= 0.5 {
            Self::HighSec
        } else if security_status > 0.0 {
            Self::LowSec
        } else {
            Self::NullSec
        }
    }
}

/// Same profile vocabulary as map-api's own `/route` search -- these bias
/// which systems a "how many jumps" search is willing to route through
/// (heavily discouraging a class doesn't just avoid it when convenient, it
/// makes even a long detour cheaper than a single jump through it), not
/// the units the reported hop count comes back in.
#[derive(Debug, Clone, Copy)]
pub struct SecurityMultipliers {
    pub highsec: f64,
    pub lowsec: f64,
    pub nullsec: f64,
}

impl SecurityMultipliers {
    pub const FASTEST: Self = Self { highsec: 1.0, lowsec: 1.0, nullsec: 1.0 };
    pub const HIGH_SEC_ONLY: Self = Self { highsec: 1.0, lowsec: 10_000.0, nullsec: 10_000.0 };
    pub const LOW_SEC_PLUS: Self = Self { highsec: 1.0, lowsec: 1.0, nullsec: 10_000.0 };

    pub fn from_profile(profile: Option<&str>) -> Self {
        match profile {
            Some("high_sec_only") => Self::HIGH_SEC_ONLY,
            Some("low_sec_plus") => Self::LOW_SEC_PLUS,
            _ => Self::FASTEST,
        }
    }

    fn for_class(self, class: SecurityClass) -> f64 {
        match class {
            SecurityClass::HighSec => self.highsec,
            SecurityClass::LowSec => self.lowsec,
            SecurityClass::NullSec => self.nullsec,
        }
    }
}

/// The New Eden stargate graph, keyed internally by a dense `u32` index
/// rather than `system_id` directly -- `system_id`s are sparse ESI ids,
/// so a `HashMap<i32, _>` lookup on every single edge relaxation in
/// Dijkstra's hot loop was real, measured overhead at this graph's scale
/// (~8.5k systems/~14k stargates): switching `adjacency`/`security_of`
/// from hash maps to arrays indexed by a system's dense position dropped
/// per-search cost enough to matter when the route handler runs hundreds
/// of searches in one request (see `distances_to_targets`). `index_of`/
/// `id_of` translate at the boundary (the handful of calls per request),
/// never inside the search itself.
///
/// Directed adjacency by index (every gate pair is synced as two rows, one
/// from each end, so this ends up effectively undirected without needing
/// to add reverse edges by hand). Loaded once and cached (see
/// `AppState::jump_graph`) -- the universe only changes on rare CCP
/// updates, not per-request.
pub struct JumpGraph {
    index_of: HashMap<i32, u32>,
    id_of: Vec<i32>,
    adjacency: Vec<Vec<u32>>,
    security_of: Vec<SecurityClass>,
}

impl JumpGraph {
    pub async fn load(pool: &Pool) -> Result<Self, AppError> {
        tracing::info!("loading jump graph");
        let client = pool.get().await?;

        let system_rows = client.query("SELECT system_id, security_status FROM solar_systems", &[]).await?;
        let mut index_of = HashMap::with_capacity(system_rows.len());
        let mut id_of = Vec::with_capacity(system_rows.len());
        let mut security_of = Vec::with_capacity(system_rows.len());
        for row in &system_rows {
            let system_id: i32 = row.get(0);
            let security_status: f64 = row.get(1);
            let idx = id_of.len() as u32;
            index_of.insert(system_id, idx);
            id_of.push(system_id);
            security_of.push(SecurityClass::from_status(security_status));
        }

        let stargate_rows = client.query("SELECT system_id, destination_system_id FROM stargates", &[]).await?;
        let mut adjacency: Vec<Vec<u32>> = vec![Vec::new(); id_of.len()];
        for row in stargate_rows {
            let from: i32 = row.get(0);
            let to: i32 = row.get(1);
            // Both ends are always systems from the same solar_systems
            // load above, but indexing defensively rather than assuming
            // that invariant holds forever.
            if let (Some(&from_idx), Some(&to_idx)) = (index_of.get(&from), index_of.get(&to)) {
                adjacency[from_idx as usize].push(to_idx);
            }
        }

        Ok(Self { index_of, id_of, adjacency, security_of })
    }

    /// Every system reachable from `source`, with its `multipliers`-biased
    /// jump count. Runs to full exhaustion of the connected component --
    /// use `distances_to_targets` instead when the caller only cares about
    /// a known, bounded set of destinations, which is the common case and
    /// much cheaper (this one visits the *whole* graph, ~8.5k systems,
    /// every call). Used for the "from my current location" feature,
    /// where the caller can't know in advance which systems the query's
    /// buy-side candidates will land on.
    pub fn distances_from(&self, source: i32, multipliers: SecurityMultipliers) -> HashMap<i32, i32> {
        self.dijkstra(source, multipliers, None).0
    }

    /// Same search as `distances_from`, but stops as soon as every id in
    /// `targets` has been settled instead of continuing to the whole
    /// graph -- bounded by the jump-distance to the *farthest* target, not
    /// total graph size. The route handler uses this for buy-system to
    /// sell-system jumps (see routes/arbitrage.rs's `fill_jumps`), where
    /// each buy system typically only needs 1-2 sell systems' distances,
    /// not all ~8.5k.
    pub fn distances_to_targets(&self, source: i32, targets: &HashSet<i32>, multipliers: SecurityMultipliers) -> HashMap<i32, i32> {
        self.dijkstra(source, multipliers, Some(targets)).0
    }

    /// The actual system-by-system shortest (security-weighted) path from
    /// `source` to `target`, inclusive of both endpoints -- `None` if
    /// either id is unknown or `target` isn't reachable from `source` at
    /// all. Used by the route planner's `target_system_id` option to build
    /// a "systems along the way" corridor to constrain the search to, not
    /// just a jump count the way `distances_to_targets` is used for.
    pub fn shortest_path(&self, source: i32, target: i32, multipliers: SecurityMultipliers) -> Option<Vec<i32>> {
        let &source_idx = self.index_of.get(&source)?;
        let &target_idx = self.index_of.get(&target)?;
        if source_idx == target_idx {
            return Some(vec![source]);
        }

        let mut targets = HashSet::new();
        targets.insert(target);
        let (_, parent_idx) = self.dijkstra(source, multipliers, Some(&targets));
        if parent_idx.is_empty() || parent_idx[target_idx as usize] == NO_PARENT {
            return None; // empty means bad source; NO_PARENT means unreachable
        }

        let mut path_idx = vec![target_idx];
        let mut cur = target_idx;
        while cur != source_idx {
            let p = parent_idx[cur as usize];
            debug_assert_ne!(p, NO_PARENT, "path reconstruction hit an unsettled node after reachability was confirmed above");
            path_idx.push(p);
            cur = p;
        }
        path_idx.reverse();
        Some(path_idx.into_iter().map(|idx| self.id_of[idx as usize]).collect())
    }

    /// Returns settled distances (by system id) alongside `parent_idx`,
    /// indexed by dense node index -- `parent_idx[i]` is the index of the
    /// node edge relaxation last approached `i` through, or `NO_PARENT` if
    /// `i` was never reached. Only `shortest_path` needs the parent
    /// pointers; `distances_from`/`distances_to_targets` discard them.
    fn dijkstra(&self, source: i32, multipliers: SecurityMultipliers, targets: Option<&HashSet<i32>>) -> (HashMap<i32, i32>, Vec<u32>) {
        let Some(&source_idx) = self.index_of.get(&source) else { return (HashMap::new(), Vec::new()) };
        let n = self.adjacency.len();

        let mut weighted_dist = vec![f64::INFINITY; n];
        // i32::MIN marks "not yet settled" -- distinct from any real hop
        // count, which is always >= 0.
        let mut hops = vec![i32::MIN; n];
        let mut parent_idx = vec![NO_PARENT; n];
        let mut heap: BinaryHeap<Reverse<HeapEntry>> = BinaryHeap::new();

        // `still_needed[idx]` is cleared (and `remaining` decremented) the
        // first time that index is settled; once `remaining` hits zero
        // every requested target has its final answer and the search can
        // stop without exhausting the rest of the graph.
        let mut still_needed = targets.map(|_| vec![false; n]);
        let mut remaining = 0usize;
        if let (Some(t), Some(still_needed)) = (targets, still_needed.as_mut()) {
            for &id in t {
                if let Some(&idx) = self.index_of.get(&id) {
                    if idx != source_idx && !still_needed[idx as usize] {
                        still_needed[idx as usize] = true;
                        remaining += 1;
                    }
                }
            }
        }

        weighted_dist[source_idx as usize] = 0.0;
        hops[source_idx as usize] = 0;
        heap.push(Reverse(HeapEntry(0.0, source_idx)));

        while let Some(Reverse(HeapEntry(cost, node))) = heap.pop() {
            let node_usize = node as usize;
            if cost > weighted_dist[node_usize] {
                continue; // stale heap entry, already found a better way here
            }
            if let Some(still_needed) = still_needed.as_mut() {
                if still_needed[node_usize] {
                    still_needed[node_usize] = false;
                    remaining -= 1;
                    if remaining == 0 {
                        break;
                    }
                }
            }
            let node_hops = hops[node_usize];
            for &next in &self.adjacency[node_usize] {
                let next_usize = next as usize;
                let weighted = cost + multipliers.for_class(self.security_of[next_usize]);
                if weighted < weighted_dist[next_usize] {
                    weighted_dist[next_usize] = weighted;
                    hops[next_usize] = node_hops + 1;
                    parent_idx[next_usize] = node;
                    heap.push(Reverse(HeapEntry(weighted, next)));
                }
            }
        }

        let distances = hops
            .iter()
            .enumerate()
            .filter(|&(_, &h)| h != i32::MIN)
            .map(|(idx, &h)| (self.id_of[idx], h))
            .collect();
        (distances, parent_idx)
    }
}

/// Sentinel in `dijkstra`'s `parent_idx` for "no parent recorded" (the
/// source itself, or a node never reached) -- distinct from any real dense
/// index since the graph is far smaller than `u32::MAX` nodes.
const NO_PARENT: u32 = u32::MAX;

/// Ord/PartialOrd manually implemented since f64 doesn't implement Ord (no
/// total order over NaN) -- every cost this graph produces is a finite,
/// non-negative sum of `SecurityMultipliers` constants, so `partial_cmp`
/// never actually returns `None` in practice.
#[derive(Clone, Copy, PartialEq)]
struct HeapEntry(f64, u32);

impl Eq for HeapEntry {}

impl Ord for HeapEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal).then_with(|| self.1.cmp(&other.1))
    }
}

impl PartialOrd for HeapEntry {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
