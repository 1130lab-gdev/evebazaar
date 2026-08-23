use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashMap, HashSet};

use anyhow::{Context, Result};
use deadpool_postgres::Pool;

/// Meters per AU -- `stargates.position_x/y/z` (and so
/// `warp_neighbors`' distances) are in meters; warp speed is quoted in
/// AU/s, matching how EVE itself reports ship warp speed.
const METERS_PER_AU: f64 = 149_597_870_700.0;

/// A fixed per-jump loading-screen cost, in seconds. Not derived from any
/// real data source -- a tunable constant, documented as such. Applied to
/// both the reported travel time and (scaled by the destination system's
/// security multiplier) the search cost.
const JUMP_CONSTANT_SECS: f64 = 5.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SecurityClass {
    HighSec,
    LowSec,
    NullSec,
}

impl SecurityClass {
    fn from_status(security_status: f64) -> Self {
        if security_status >= 0.5 {
            SecurityClass::HighSec
        } else if security_status > 0.0 {
            SecurityClass::LowSec
        } else {
            SecurityClass::NullSec
        }
    }
}

/// Per-security-class cost multiplier for the *search*, not the reported
/// time -- a lowsec leg doesn't really take longer to fly, this just biases
/// Dijkstra away from it. `RouteSystem`/`RouteLeg` report real,
/// un-multiplied time.
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

    fn for_class(&self, class: SecurityClass) -> f64 {
        match class {
            SecurityClass::HighSec => self.highsec,
            SecurityClass::LowSec => self.lowsec,
            SecurityClass::NullSec => self.nullsec,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EdgeKind {
    Jump,
    Warp,
}

/// One edge on the winning path, in travel order. `from`/`to` are stargate
/// ids; for a `Jump` edge they're the two ends of the same gate pair
/// (`from`'s `destination_stargate_id` is `to`), for a `Warp` edge they're
/// two different gates in the same system. `time_s` is real, un-multiplied
/// travel time.
#[derive(Debug, Clone)]
pub struct RouteEdge {
    pub kind: EdgeKind,
    pub from_stargate_id: i32,
    pub from_system_id: i32,
    pub to_stargate_id: i32,
    pub to_system_id: i32,
    pub time_s: f64,
}

pub struct RoutePath {
    pub total_time_s: f64,
    pub edges: Vec<RouteEdge>,
}

/// In-memory snapshot of the stargate network, built once at startup (see
/// module docs on `AppState` for why this doesn't refresh on an interval).
pub struct Graph {
    /// Every stargate's own jump target: (destination_stargate_id, destination_system_id).
    jump_target: HashMap<i32, (i32, i32)>,
    /// Pairwise in-system distances (meters), indexed by either endpoint.
    warp_neighbors: HashMap<i32, Vec<(i32, f64)>>,
    system_of: HashMap<i32, i32>,
    system_stargates: HashMap<i32, Vec<i32>>,
    security_of: HashMap<i32, SecurityClass>,
}

impl Graph {
    pub async fn build(pool: &Pool) -> Result<Self> {
        let client = pool.get().await.context("getting connection to build map graph")?;

        let system_rows = client
            .query("SELECT system_id, security_status FROM solar_systems", &[])
            .await
            .context("loading systems for map graph")?;
        let mut security_of = HashMap::with_capacity(system_rows.len());
        for row in &system_rows {
            let system_id: i32 = row.get(0);
            let security_status: f64 = row.get(1);
            security_of.insert(system_id, SecurityClass::from_status(security_status));
        }

        let stargate_rows = client
            .query(
                "SELECT stargate_id, system_id, destination_stargate_id, destination_system_id FROM stargates",
                &[],
            )
            .await
            .context("loading stargates for map graph")?;
        let mut jump_target = HashMap::with_capacity(stargate_rows.len());
        let mut system_of = HashMap::with_capacity(stargate_rows.len());
        let mut system_stargates: HashMap<i32, Vec<i32>> = HashMap::new();
        for row in &stargate_rows {
            let stargate_id: i32 = row.get(0);
            let system_id: i32 = row.get(1);
            let destination_stargate_id: i32 = row.get(2);
            let destination_system_id: i32 = row.get(3);
            jump_target.insert(stargate_id, (destination_stargate_id, destination_system_id));
            system_of.insert(stargate_id, system_id);
            system_stargates.entry(system_id).or_default().push(stargate_id);
        }

        let pair_rows = client
            .query(
                "SELECT sg1.stargate_id, sg2.stargate_id,
                        sqrt(pow(sg1.position_x - sg2.position_x, 2)
                           + pow(sg1.position_y - sg2.position_y, 2)
                           + pow(sg1.position_z - sg2.position_z, 2))
                 FROM stargates sg1
                 JOIN stargates sg2 ON sg2.system_id = sg1.system_id AND sg2.stargate_id > sg1.stargate_id",
                &[],
            )
            .await
            .context("loading in-system stargate pairs for map graph")?;
        let mut warp_neighbors: HashMap<i32, Vec<(i32, f64)>> = HashMap::new();
        for row in &pair_rows {
            let a: i32 = row.get(0);
            let b: i32 = row.get(1);
            let distance_m: f64 = row.get(2);
            warp_neighbors.entry(a).or_default().push((b, distance_m));
            warp_neighbors.entry(b).or_default().push((a, distance_m));
        }

        tracing::info!(
            systems = security_of.len(),
            stargates = jump_target.len(),
            warp_pairs = pair_rows.len(),
            "map graph built"
        );

        Ok(Graph { jump_target, warp_neighbors, system_of, system_stargates, security_of })
    }

    pub fn system_exists(&self, system_id: i32) -> bool {
        self.security_of.contains_key(&system_id)
    }

    /// Dijkstra from every stargate in `source_system_id` to the
    /// cheapest-to-reach stargate in `target_system_id`. Returns `None` if
    /// either system has no stargates (including unknown system ids) or
    /// isn't reachable from the other at all -- including when
    /// `avoid_system_ids` blocks off every path (that's a legitimate "no
    /// route" outcome, not an error, same as for a genuinely disconnected
    /// pair of systems).
    ///
    /// The source system is never checked against `avoid_system_ids`: you
    /// necessarily start there regardless of what the caller asked to
    /// avoid, since `start_gates` are seeded directly rather than reached
    /// via a jump edge. The target system *is* checked -- avoiding your
    /// own destination is a contradictory request, and failing honestly is
    /// less surprising than silently ignoring it.
    pub fn find_route(
        &self,
        source_system_id: i32,
        target_system_id: i32,
        warp_speed_au_s: f64,
        multipliers: SecurityMultipliers,
        avoid_system_ids: &HashSet<i32>,
    ) -> Option<RoutePath> {
        let start_gates = self.system_stargates.get(&source_system_id)?;
        let target_gates: HashSet<i32> = self.system_stargates.get(&target_system_id)?.iter().copied().collect();
        if start_gates.is_empty() || target_gates.is_empty() {
            return None;
        }

        // Weighted cost (drives the search) is kept separate from the real,
        // un-multiplied time stored per edge for reporting -- see
        // `SecurityMultipliers`'s doc comment for why.
        let mut dist: HashMap<i32, f64> = HashMap::new();
        let mut prev: HashMap<i32, (i32, EdgeKind, f64)> = HashMap::new();
        let mut heap: BinaryHeap<Reverse<HeapEntry>> = BinaryHeap::new();

        for &gate in start_gates {
            dist.insert(gate, 0.0);
            heap.push(Reverse(HeapEntry(0.0, gate)));
        }

        let mut winner: Option<(i32, f64)> = None;
        while let Some(Reverse(HeapEntry(cost, node))) = heap.pop() {
            if cost > *dist.get(&node).unwrap_or(&f64::INFINITY) {
                continue; // stale heap entry, already found a better way here
            }
            if target_gates.contains(&node) {
                winner = Some((node, cost));
                break; // Dijkstra: first settled target-system node is optimal
            }

            if let Some(&(dest_gate, dest_system)) = self.jump_target.get(&node) {
                if !avoid_system_ids.contains(&dest_system) {
                    let weighted = cost + JUMP_CONSTANT_SECS * multipliers.for_class(self.security_of[&dest_system]);
                    if weighted < *dist.get(&dest_gate).unwrap_or(&f64::INFINITY) {
                        dist.insert(dest_gate, weighted);
                        prev.insert(dest_gate, (node, EdgeKind::Jump, JUMP_CONSTANT_SECS));
                        heap.push(Reverse(HeapEntry(weighted, dest_gate)));
                    }
                }
            }

            let system_id = self.system_of[&node];
            if let Some(neighbors) = self.warp_neighbors.get(&node) {
                for &(other, distance_m) in neighbors {
                    let real_time_s = (distance_m / METERS_PER_AU) / warp_speed_au_s;
                    let weighted = cost + real_time_s * multipliers.for_class(self.security_of[&system_id]);
                    if weighted < *dist.get(&other).unwrap_or(&f64::INFINITY) {
                        dist.insert(other, weighted);
                        prev.insert(other, (node, EdgeKind::Warp, real_time_s));
                        heap.push(Reverse(HeapEntry(weighted, other)));
                    }
                }
            }
        }

        let (end_gate, _) = winner?;

        let mut edges = Vec::new();
        let mut current = end_gate;
        while let Some(&(from, kind, time_s)) = prev.get(&current) {
            edges.push(RouteEdge {
                kind,
                from_stargate_id: from,
                from_system_id: self.system_of[&from],
                to_stargate_id: current,
                to_system_id: self.system_of[&current],
                time_s,
            });
            current = from;
        }
        edges.reverse();

        let total_time_s = edges.iter().map(|e| e.time_s).sum();
        Some(RoutePath { total_time_s, edges })
    }
}

/// `f64` isn't `Ord` (NaN), so the heap wraps it in a type that treats
/// costs as always-comparable -- safe here since every cost this graph
/// produces is finite and non-negative.
#[derive(Clone, Copy, PartialEq)]
struct HeapEntry(f64, i32);

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
