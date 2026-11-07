use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use axum::{
    Json,
    extract::State,
    http::{HeaderValue, header},
    response::IntoResponse,
};
use axum_extra::extract::Query;
use serde::Deserialize;

use crate::{
    db::{
        self,
        arbitrage::ArbitrageFilter,
        jumps::{JumpGraph, SecurityMultipliers},
        market_books::{EligibleType, MarketBooks},
    },
    domain::{ArbitrageOpportunity, RoutePlan, RoutePlanLeg},
    error::{AppError, AppResult},
    state::AppState,
};

/// In-process cache of computed itinerary sets, keyed on a deterministic
/// debug render of the parsed request params. A route search is a
/// branch-and-bound over the market exploring up to `MAX_NODES_EXPLORED`
/// nodes, and start systems are now restricted to four trade hubs, so
/// the realistic key space is small and worth caching hard: entries are
/// served regardless of age and the whole cache is dropped and re-warmed
/// on a fixed interval (see `warm_route_cache`) rather than expiring
/// per-entry. The interval is aligned with the ~5-minute market sync.
const ROUTE_CACHE_INTERVAL: Duration = Duration::from_secs(300);
const ROUTE_CACHE_MAX_ENTRIES: usize = 512;
/// Upper bound on how many distinct cached searches the background task
/// re-runs after each clear -- caps the recompute burst against Postgres.
const ROUTE_CACHE_WARM_LIMIT: usize = 64;

type RouteCache = Mutex<HashMap<String, (Arc<Vec<RoutePlan>>, RoutePlannerParams)>>;
static ROUTE_CACHE: LazyLock<RouteCache> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn route_cache_key(params: &RoutePlannerParams) -> String {
    format!("{params:?}")
}

fn route_cache_get(key: &str) -> Option<Arc<Vec<RoutePlan>>> {
    ROUTE_CACHE.lock().unwrap().get(key).map(|(plans, _)| plans.clone())
}

fn route_cache_put(key: String, plans: Arc<Vec<RoutePlan>>, params: RoutePlannerParams) {
    let mut cache = ROUTE_CACHE.lock().unwrap();
    if cache.len() >= ROUTE_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
        cache.clear();
    }
    cache.insert(key, (plans, params));
}

/// Drops every cached search on `ROUTE_CACHE_INTERVAL`, then recomputes the
/// most recently cached ones so the common queries -- each of the four
/// trade hubs against a handful of budgets -- stay warm across the market
/// data refreshing underneath them. Spawned once from `main`.
pub async fn warm_route_cache(state: AppState) {
    loop {
        tokio::time::sleep(ROUTE_CACHE_INTERVAL).await;
        let stale: Vec<(String, RoutePlannerParams)> = {
            let mut cache = ROUTE_CACHE.lock().unwrap();
            let entries = cache.iter().map(|(k, (_, p))| (k.clone(), p.clone())).collect();
            cache.clear();
            entries
        };
        let mut warmed = 0usize;
        for (key, params) in stale.into_iter().take(ROUTE_CACHE_WARM_LIMIT) {
            match compute_plans(&state, params.clone()).await {
                Ok(plans) => {
                    route_cache_put(key, Arc::new(plans), params);
                    warmed += 1;
                }
                Err(e) => tracing::debug!(error = %e, "route cache warm: skipped an entry"),
            }
        }
        tracing::info!(warmed, "route cache cleared and re-warmed");
    }
}

const DEFAULT_SALES_TAX_PCT: f64 = 7.5;
const DEFAULT_MAX_LEGS: i32 = 3;
// Held at 3 for now (search cost grows fast per extra leg); the frontend
// caps its input to match.
const MAX_MAX_LEGS: i32 = 3;
/// No longer request-controlled: the search keeps its best `N` routes for
/// the branch-and-bound prune floor (see `prune_threshold`) and returns
/// them all. Set well above what a realistic market yields as *profitable*
/// multi-hop routes, so in practice every profitable route found is
/// returned, but bounded so a degenerate market can't blow up the response.
const ROUTE_RESULTS_CAP: i32 = 25;
/// Circuit breaker on total node expansions (one `find_opportunities` each) across the whole
/// branch-and-bound search -- the profit-upper-bound pruning (see
/// `dfs`/`estimate_max_hop_profit`) is what's *supposed* to keep the
/// search small, but it's a heuristic bound, not a guarantee, and a
/// pathological request (e.g. a huge cargo hold against a market with
/// many similarly-priced options) could still branch wide before the
/// bound bites. This caps worst-case latency at a known multiple of a
/// single expansion's cost regardless of how well the bound performs on any
/// given request.
const MAX_NODES_EXPLORED: usize = 200;
/// How many candidate next hops (see `HopCandidate`), best-first by
/// `hop_profit`, `find_hop_candidates` keeps per node. Measured, needed:
/// the sell side of a hop is never constrained to anywhere specific (the
/// whole point of the search is finding the best place to sell, not a
/// fixed one), and against a ~20k-item catalog even a single well-
/// connected buy system routinely has 100+ distinct profitable sell
/// destinations. The profit bound in `dfs` *should* be what keeps that
/// fan-out from costing an expansion per candidate, but it can't: with
/// `remaining_legs_after >= 1`, the bound's `remaining_legs_after *
/// max_hop_profit` ceiling term is -- in a market where good multi-leg
/// chains are lumpy/sparse rather than smoothly distributed -- routinely
/// as large as the actual best *total* profit found, so it can't rule out
/// any positive-profit candidate until the very last hop, regardless of
/// `max_legs`. That's a property of this bound shape against this kind of
/// profit distribution, not a bug in it; a hard cap here is the practical
/// fix, applied at every node (not just the root) so it bounds every
/// depth's fan-out, not only the first one.
const MAX_CANDIDATES_PER_NODE: usize = 20;
/// How much of the route's remaining ISK a single hop is allowed to commit,
/// tried at each of these levels (see `pack_hop_variants`) -- not just
/// 100%. `pack_hop` always spends maximally within whatever budget it's
/// handed, so without this the search only ever considers "commit
/// everything profitable to whatever's right here," and can never discover
/// that holding capital back for a later, better-margin hop beats maxing
/// out this one. Descending so the fullest, usually most-profitable
/// commitment sorts first for `find_hop_candidates`'s best-first ordering.
const HOP_ISK_COMMIT_FRACTIONS: &[f64] = &[1.0, 0.5, 0.25, 0.1];

#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
pub struct RoutePlannerParams {
    /// Required. The hauling ship's cargo hold size, m³.
    pub cargo_capacity_m3: Option<f64>,
    /// Required. ISK budget the route is allowed to spend.
    pub isk_available: Option<f64>,
    /// Where the first leg must buy from -- required. An explicit value
    /// here still wins. An unconstrained first hop was tried and dropped:
    /// with nothing narrowing `include_buy_system_ids`, the first hop's
    /// candidate count -- and so the branch-and-bound search's root
    /// branching factor -- scales with the whole market, which the
    /// profit-upper-bound pruning in `dfs` can't meaningfully cut down
    /// (see that function's doc comment for why), making it dramatically
    /// slower than every other, already-constrained hop in the search.
    pub start_system_id: Option<i32>,
    /// Where the route should end up -- optional. When set, every hop's
    /// sell side is constrained to the shortest (security-weighted)
    /// stargate path from `start_system_id` to this system (see
    /// `sell_corridor`/`JumpGraph::shortest_path`), and only a route whose
    /// current position actually reaches this system counts as a result
    /// (see `maybe_record`) -- "profitable things to carry along the way
    /// from A to B," not just "profitable things to carry from A."
    /// Mutually exclusive with `return_to_start` (400 if both are set).
    pub target_system_id: Option<i32>,
    /// Number of buy-sell hops per route. Defaults to 3, clamped to 6 --
    /// each additional leg deepens the branch-and-bound search by another
    /// level (see `plan_routes`), and realistic hauling itineraries rarely
    /// run much longer than this anyway.
    pub max_legs: Option<i32>,
    /// One of `high_sec_only`, `low_sec_plus` -- same vocabulary as the
    /// arbitrage scanner's own param. Unlike that scanner's version, this
    /// is a hard constraint here, not just a jump-distance bias: every
    /// system the route touches, on either the buy or sell side of every
    /// leg, must satisfy it (see `allowed_security_classes`), not merely
    /// be routed around when convenient.
    pub security_profile: Option<String>,
    pub sales_tax_pct: Option<f64>,
    /// Forces the last leg to sell back into the resolved `start_system_id`
    /// instead of searching for the single best final destination.
    /// Requires `max_legs >= 2`: the first leg's buy and sell systems are
    /// never the same, so a one-leg route can never close its own loop.
    /// Defaults to `false`.
    pub return_to_start: Option<bool>,
    // The rest of these mirror routes/arbitrage.rs's `ArbitrageParams`
    // field-for-field (see that struct's doc comments for what each
    // means) -- the same constraints on which items are even eligible,
    // shared between opportunity browsing and route planning now, so a
    // route search can be scoped down ("only Ships", "min 5M profit",
    // "never through this system") exactly like the arbitrage scanner's
    // own filters. Folded into `OpportunityFilters` in the handler below
    // rather than threaded as loose params from here on.
    pub q: Option<String>,
    #[serde(default)]
    pub category_id: Vec<i32>,
    #[serde(default)]
    pub market_group_id: Vec<i32>,
    pub min_buy_price: Option<f64>,
    pub max_buy_price: Option<f64>,
    pub min_sell_price: Option<f64>,
    pub max_sell_price: Option<f64>,
    pub min_profit: Option<f64>,
    pub min_profit_pct: Option<f64>,
    pub min_volume: Option<i64>,
    pub max_total_cost: Option<f64>,
    /// On top of (never replacing) the search's own visited-systems
    /// exclusion -- see `find_hop_candidates`.
    #[serde(default)]
    pub exclude_system_id: Vec<i32>,
    /// Intersected with whatever `security_profile` already implies, not
    /// a replacement for it -- seeing `high_sec_only` and
    /// `buy_security_class=lowsec` together is a contradiction that
    /// correctly yields zero results, not one silently overriding the
    /// other.
    #[serde(default)]
    pub buy_security_class: Vec<String>,
    #[serde(default)]
    pub sell_security_class: Vec<String>,
    /// When true, drop items that are illegal to haul in most of empire
    /// space (boosters and slaves). Defaults to false.
    pub exclude_illegal: Option<bool>,
}

/// The subset of arbitrage-scanner-style filters (see routes/arbitrage.rs's
/// `ArbitrageParams`) that opportunity browsing and route planning now
/// share -- constraints on which items are even eligible, independent of
/// the route-specific mechanics (which systems, how many legs, ...)
/// layered on top per hop in `find_hop_candidates`. Bundled into one
/// struct rather than left as loose `PlanRoutesParams`/`DfsConfig` fields
/// purely to keep those from growing yet more fields for what's really one
/// cohesive concern.
#[derive(Debug, Clone, Default)]
struct OpportunityFilters {
    name_query: Option<String>,
    category_ids: Option<Vec<i32>>,
    market_group_ids: Option<Vec<i32>>,
    min_buy_price: Option<f64>,
    max_buy_price: Option<f64>,
    min_sell_price: Option<f64>,
    max_sell_price: Option<f64>,
    min_profit_per_unit: Option<f64>,
    min_profit_pct: Option<f64>,
    min_volume_available: Option<i64>,
    max_total_cost: Option<f64>,
    exclude_system_ids: Option<Vec<i32>>,
    buy_security_classes: Option<Vec<String>>,
    sell_security_classes: Option<Vec<String>>,
    exclude_illegal: bool,
}

/// Intersects a `security_profile`-derived class list with an explicit,
/// user-picked one -- `None` on one side just means "no constraint from
/// that source," so the other side passes through unchanged; `None` on
/// both means no constraint at all. An intersection that comes out empty
/// (e.g. `high_sec_only` combined with an explicit `lowsec` pick) is kept
/// as `Some(vec![])`, not silently dropped back to `None` -- that
/// correctly matches no system at all, which is the right answer to a
/// request that contradicts itself, not "ignore one of the two asks."
pub(crate) fn intersect_classes(profile: Option<Vec<String>>, explicit: Vec<String>) -> Option<Vec<String>> {
    let explicit = (!explicit.is_empty()).then_some(explicit);
    match (profile, explicit) {
        (Some(p), Some(e)) => Some(p.into_iter().filter(|c| e.contains(c)).collect()),
        (Some(p), None) => Some(p),
        (None, Some(e)) => Some(e),
        (None, None) => None,
    }
}

/// Maps a route security preference onto the *hard* system-class
/// constraint the search itself must obey -- distinct from
/// `jumps::SecurityMultipliers`, which only biases the reported jump
/// count/distance for a preference without actually restricting where a
/// route is allowed to buy or sell. `None` (the "fastest" default, no
/// preference) applies no constraint. Applied to both `buy_security_classes`
/// and `sell_security_classes` in every hop's search (see
/// `find_hop_candidates`/`estimate_max_hop_profit`) so a "high_sec_only"
/// route can't end up buying or selling in low/null-sec on either side of
/// any leg, including the first.
pub(crate) fn allowed_security_classes(security_profile: Option<&str>) -> Option<Vec<String>> {
    match security_profile {
        Some("high_sec_only") => Some(vec!["highsec".to_string()]),
        Some("low_sec_plus") => Some(vec!["highsec".to_string(), "lowsec".to_string()]),
        _ => None,
    }
}

#[utoipa::path(
    get,
    path = "/route-planner",
    tag = "route-planner",
    params(RoutePlannerParams),
    responses(
        (status = 200, description = "Ranked candidate multi-hop hauling itineraries", body = Vec<RoutePlan>),
        (status = 400, description = "Missing/invalid cargo, ISK, or start system"),
    ),
)]
pub async fn plan_route(
    State(state): State<AppState>,
    Query(params): Query<RoutePlannerParams>,
) -> AppResult<impl IntoResponse> {
    // Handler-set (overrides the router's 60s default): a route plan is
    // held in-process until the next cache clear (~5 min, see
    // `warm_route_cache`), so the client hint matches.
    let cache_headers = [(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=300"))];
    let key = route_cache_key(&params);
    if let Some(plans) = route_cache_get(&key) {
        return Ok((cache_headers, Json(plans)));
    }
    let plans = Arc::new(compute_plans(&state, params.clone()).await?);
    route_cache_put(key, plans.clone(), params);
    Ok((cache_headers, Json(plans)))
}

/// Everything `plan_route` does minus the HTTP cache wrapper -- also
/// called by `warm_route_cache` to repopulate hot entries after a clear.
async fn compute_plans(state: &AppState, params: RoutePlannerParams) -> AppResult<Vec<RoutePlan>> {
    let cargo_capacity_m3 = params
        .cargo_capacity_m3
        .ok_or_else(|| AppError::BadRequest("cargo_capacity_m3 is required".to_string()))?;
    let isk_available = params
        .isk_available
        .ok_or_else(|| AppError::BadRequest("isk_available is required".to_string()))?;
    if cargo_capacity_m3 <= 0.0 {
        return Err(AppError::BadRequest("cargo_capacity_m3 must be positive".to_string()));
    }
    if isk_available <= 0.0 {
        return Err(AppError::BadRequest("isk_available must be positive".to_string()));
    }

    let max_legs = params.max_legs.unwrap_or(DEFAULT_MAX_LEGS).clamp(1, MAX_MAX_LEGS);
    let max_results = ROUTE_RESULTS_CAP;
    let sales_tax_pct = params.sales_tax_pct.unwrap_or(DEFAULT_SALES_TAX_PCT);
    let security_profile = params.security_profile.clone();
    let start_system_id = params
        .start_system_id
        .ok_or_else(|| AppError::BadRequest("start_system_id is required".to_string()))?;
    let return_to_start = params.return_to_start.unwrap_or(false);
    if return_to_start && max_legs < 2 {
        return Err(AppError::BadRequest(
            "return_to_start requires max_legs >= 2 -- a single leg's buy and sell systems are never the same, so it can never close its own loop".to_string(),
        ));
    }
    if return_to_start && params.target_system_id.is_some() {
        return Err(AppError::BadRequest(
            "return_to_start and target_system_id are mutually exclusive -- one asks the route to end back where it started, the other asks it to end somewhere else specific".to_string(),
        ));
    }
    let multipliers = SecurityMultipliers::from_profile(security_profile.as_deref());
    let allowed_security_classes = allowed_security_classes(security_profile.as_deref());
    let opportunity_filters = OpportunityFilters {
        name_query: params.q.filter(|q| !q.trim().is_empty()).map(|q| q.trim().to_string()),
        category_ids: (!params.category_id.is_empty()).then_some(params.category_id),
        market_group_ids: (!params.market_group_id.is_empty()).then_some(params.market_group_id),
        min_buy_price: params.min_buy_price,
        max_buy_price: params.max_buy_price,
        min_sell_price: params.min_sell_price,
        max_sell_price: params.max_sell_price,
        min_profit_per_unit: params.min_profit,
        min_profit_pct: params.min_profit_pct,
        min_volume_available: params.min_volume,
        max_total_cost: params.max_total_cost,
        exclude_system_ids: (!params.exclude_system_id.is_empty()).then_some(params.exclude_system_id),
        buy_security_classes: intersect_classes(allowed_security_classes.clone(), params.buy_security_class),
        sell_security_classes: intersect_classes(allowed_security_classes, params.sell_security_class),
        exclude_illegal: params.exclude_illegal.unwrap_or(false),
    };
    let graph = state.jump_graph().await?;

    // The route's sell side is confined to this corridor for the whole
    // search (see PlanRoutesParams::sell_corridor) -- computed once here,
    // against the same graph/profile `fill_route_jumps` uses below, rather
    // than per-node, since it doesn't depend on anything the search
    // discovers along the way.
    let sell_corridor = match params.target_system_id {
        Some(target) => Some(graph.shortest_path(start_system_id, target, multipliers).ok_or_else(|| {
            AppError::BadRequest("no stargate path exists between start_system_id and target_system_id".to_string())
        })?),
        None => None,
    };

    let books = state.market_books().await?;
    let types = db::market_books::load_eligible_types(
        &state.db,
        opportunity_filters.name_query.as_deref(),
        opportunity_filters.category_ids.as_deref(),
        opportunity_filters.market_group_ids.as_deref(),
        opportunity_filters.exclude_illegal,
    )
    .await?;

    let mut plans = plan_routes(
        &books,
        &types,
        PlanRoutesParams {
            start_system_id,
            target_system_id: params.target_system_id,
            sell_corridor,
            cargo_capacity_m3,
            isk_available,
            max_legs,
            max_results,
            sales_tax_pct,
            return_to_start,
            opportunity_filters,
        },
    );

    fill_route_jumps(&mut plans, graph, multipliers);

    Ok(plans)
}

/// One in-progress candidate itinerary during the branch-and-bound search
/// (see `dfs`) -- becomes a `RoutePlan` once recorded as a result.
#[derive(Debug, Clone)]
struct PartialRoute {
    current_system_id: i32,
    /// Where this route began -- `start_system_id`, fixed for the whole
    /// search. Only used by `return_to_start`'s forced final hop.
    origin_system_id: i32,
    /// Cash on hand *right now*, at `current_system_id` -- not "however
    /// much of the starting budget hasn't been spent yet." Every hop is a
    /// complete buy-then-sell round trip (see `extend_route_with_hop`): the
    /// ISK spent buying at that hop's buy system comes back, plus profit,
    /// the moment its items sell at the hop's sell system, i.e. by the time
    /// the route is sitting at `current_system_id` looking for its next
    /// hop. So this only ever grows by each hop's profit, never shrinks by
    /// its cost -- a route that spent its *entire* budget on hop 1 has
    /// *more* to spend on hop 2, not less, same as a real hauler who's
    /// already sold what they bought.
    remaining_isk: f64,
    /// Every system touched so far (as either a buy or sell stop), fed
    /// back in as `exclude_system_ids` on the next expansion so a route
    /// can't loop back through somewhere it already visited.
    visited_system_ids: Vec<i32>,
    legs: Vec<RoutePlanLeg>,
    total_profit: f64,
    /// Sum of every hop's `hop_cost` so far -- total capital put toward
    /// buying across the whole route, even capital that was later
    /// recouped (with profit) and reused on a later hop. This -- not
    /// `remaining_isk`'s net cash-on-hand -- is what `RoutePlan.total_cost`
    /// reports: "how much ISK moved through your hands buying stuff,"
    /// the right denominator for the profit-percentage the frontend
    /// computes from it.
    total_cost: f64,
}

/// One scored, but not-yet-committed, item purchase: `(item_profit, units,
/// cost, opportunity)`. `item_profit`/`cost` are already sized to `units`.
type ScoredLeg = (f64, i64, f64, ArbitrageOpportunity);

/// One candidate next stop: buy at `buy_system_id`, sell at
/// `sell_system_id`, carrying whichever items `pack_hop` greedily selected
/// to fill out the hold on that specific pairing. A "hop" -- not a single
/// item -- is the unit `dfs` branches on, so a stop can load up on several
/// different profitable things at once instead of being limited to the
/// single best item, same as a real hauler would.
struct HopCandidate {
    buy_system_id: i32,
    sell_system_id: i32,
    items: Vec<ScoredLeg>,
    hop_profit: f64,
    hop_cost: f64,
}

/// Finds every distinct (buy system, sell system) pairing reachable from
/// `route.current_system_id`, then greedily knapsack-packs each pairing's
/// hold at several different ISK-commitment levels via `pack_hop_variants`
/// (see its doc comment -- this is what stops the search from always
/// dumping the whole remaining balance into whatever's most profitable
/// right here, at the cost of a possibly-better trade further along).
/// Grouping by the *pair*, not just the sell system, is what's correct here
/// even though the buy system is
/// already fixed by `include_buy_system_ids` (every result trivially
/// shares it as a result) -- it's a cheap safety property, not load-
/// bearing, since a single fixed buy system can never actually produce
/// two different values to conflate.
///
/// `must_sell_at`, when given, additionally constrains the sell side to
/// exactly that system (via `include_sell_system_ids`) and spares it from
/// the usual visited-systems exclusion -- used for `return_to_start`'s
/// forced final hop, where the system that needs to be sellable at is
/// necessarily one already visited (wherever the route started).
///
/// `sell_corridor`, when given (and `must_sell_at` isn't -- the two are
/// mutually exclusive, same as `return_to_start`/`target_system_id`
/// themselves), constrains the sell side to that list instead of a single
/// system -- `target_system_id`'s "along the way" corridor, applied to
/// every hop, not just a forced final one. No exclusion-sparing needed
/// here: unlike `return_to_start`'s origin, `target_system_id` isn't
/// pre-visited, so it's never wrongly excluded in the first place, and a
/// route is free to reach it early (see `maybe_record`) rather than only
/// on some designated last hop.
///
/// `opp_filters`' `exclude_system_ids` (user-picked, e.g. "never route
/// through nullsec X") is unioned with the search's own visited-systems
/// exclusion, not a replacement for it -- both apply simultaneously.
fn find_hop_candidates(
    books: &MarketBooks,
    types: &[EligibleType],
    route: &PartialRoute,
    cargo_capacity_m3: f64,
    sales_tax_pct: f64,
    must_sell_at: Option<i32>,
    sell_corridor: Option<&[i32]>,
    opp_filters: &OpportunityFilters,
) -> Vec<HopCandidate> {
    let include_sell_system_ids = match (must_sell_at, sell_corridor) {
        (Some(id), _) => Some(vec![id]),
        (None, Some(corridor)) => Some(corridor.to_vec()),
        (None, None) => None,
    };
    let filter = ArbitrageFilter {
        include_buy_system_ids: Some(vec![route.current_system_id]),
        include_sell_system_ids,
        exclude_system_ids: {
            // `route.current_system_id` -- wherever this hop's forced buy
            // side (`include_buy_system_ids` above) is -- is always itself
            // already in `visited_system_ids` by this point: every prior
            // `extend_route_with_hop` call pushes its hop's *sell* system
            // there, and that's exactly where the route now stands, about
            // to buy again. Without excluding it here too, every hop past
            // the first would require its own buy system AND forbid it in
            // the same filter -- a self-contradictory filter, guaranteed
            // empty, silently capping every search at one hop regardless
            // of `max_legs`. `must_sell_at` gets the same exemption for the
            // same reason (see its doc comment above).
            let mut excluded: Vec<i32> = route
                .visited_system_ids
                .iter()
                .copied()
                .filter(|&id| Some(id) != must_sell_at && id != route.current_system_id)
                .collect();
            if let Some(extra) = &opp_filters.exclude_system_ids {
                excluded.extend(extra.iter().copied());
            }
            (!excluded.is_empty()).then_some(excluded)
        },
        buy_security_classes: opp_filters.buy_security_classes.clone(),
        sell_security_classes: opp_filters.sell_security_classes.clone(),
        min_buy_price: opp_filters.min_buy_price,
        max_buy_price: opp_filters.max_buy_price,
        min_sell_price: opp_filters.min_sell_price,
        max_sell_price: opp_filters.max_sell_price,
        min_profit_per_unit: opp_filters.min_profit_per_unit,
        min_profit_pct: opp_filters.min_profit_pct,
        min_volume_available: opp_filters.min_volume_available,
        max_total_cost: opp_filters.max_total_cost,
        cargo_capacity_m3: Some(cargo_capacity_m3),
        require_bid_exceeds_offer: true,
        sales_tax_pct,
        ..Default::default()
    };
    let opportunities = books.find_opportunities(types, &filter);

    let mut by_pair: HashMap<(i32, i32), Vec<ArbitrageOpportunity>> = HashMap::new();
    for opp in opportunities {
        by_pair.entry((opp.buy_system_id, opp.sell_system_id)).or_default().push(opp);
    }

    let mut per_pair_variants: Vec<((i32, i32), Vec<HopCandidate>)> = by_pair
        .into_iter()
        .filter_map(|((buy_system_id, sell_system_id), opps)| {
            let variants = pack_hop_variants(buy_system_id, sell_system_id, opps, route.remaining_isk, cargo_capacity_m3);
            (!variants.is_empty()).then_some(((buy_system_id, sell_system_id), variants))
        })
        .collect();

    // Rank pairs by their best (full-spend, always `variants[0]` -- see
    // `pack_hop_variants`) achievable profit, and keep only the top
    // `MAX_CANDIDATES_PER_NODE` distinct *pairs* -- see that constant's doc
    // comment for why the profit bound alone can't keep this fan-out in
    // check. This has to happen before flattening in each pair's smaller-
    // spend variants below, not after: truncating the flattened list
    // instead would let one especially profitable pair's several spend-
    // level siblings crowd out other, genuinely different destinations --
    // exactly the exploration breadth this cap exists to preserve, and
    // what a second, different hop later in the route depends on.
    per_pair_variants.sort_by(|a, b| b.1[0].hop_profit.partial_cmp(&a.1[0].hop_profit).unwrap_or(Ordering::Equal));
    per_pair_variants.truncate(MAX_CANDIDATES_PER_NODE);

    let mut candidates: Vec<HopCandidate> = per_pair_variants.into_iter().flat_map(|(_, variants)| variants).collect();
    candidates.sort_by(|a, b| b.hop_profit.partial_cmp(&a.hop_profit).unwrap_or(Ordering::Equal));
    candidates
}

/// Greedily fills the hold for one (buy, sell) pairing: sort its candidate
/// items by profit-per-cubic-meter descending, then take as many units of
/// each as still fit both the remaining cargo hold and the remaining ISK
/// budget, in that order, until nothing more does. An exact solution to
/// "which combination of items maximizes profit under two simultaneous
/// capacity constraints" is a 2D bounded knapsack -- textbook-solvable by
/// dynamic programming only when the constraints are small enough to index
/// a DP table by, which ISK values (routinely in the hundreds of millions)
/// rule out here. This is the standard fallback: sort by value density,
/// take greedily. Not provably optimal, but fast, and cargo volume --
/// where this heuristic's ordering choice actually matters -- is almost
/// always the binding constraint for a hauler in practice; ISK budgets
/// tend to dwarf what a single hold can carry.
fn pack_hop(buy_system_id: i32, sell_system_id: i32, mut opportunities: Vec<ArbitrageOpportunity>, isk_budget: f64, cargo_capacity_m3: f64) -> Option<HopCandidate> {
    fn profit_density(opp: &ArbitrageOpportunity) -> f64 {
        match opp.packaged_volume {
            Some(v) if v > 0.0 => opp.profit_per_unit / v,
            _ => f64::INFINITY,
        }
    }
    opportunities.sort_by(|a, b| profit_density(b).partial_cmp(&profit_density(a)).unwrap_or(Ordering::Equal));

    let mut remaining_cargo = cargo_capacity_m3;
    let mut remaining_isk = isk_budget;
    let mut items = Vec::new();
    let mut hop_profit = 0.0;
    let mut hop_cost = 0.0;

    for opp in opportunities {
        let units_by_cargo = match opp.packaged_volume {
            Some(v) if v > 0.0 => (remaining_cargo / v).floor() as i64,
            _ => i64::MAX,
        };
        let units_by_isk = if opp.buy_price > 0.0 { (remaining_isk / opp.buy_price).floor() as i64 } else { 0 };
        let units = units_by_cargo.min(opp.volume_available).min(units_by_isk);
        if units <= 0 {
            continue;
        }
        let item_profit = units as f64 * opp.profit_per_unit;
        if item_profit <= 0.0 {
            continue;
        }
        let cost = units as f64 * opp.buy_price;
        remaining_cargo -= opp.packaged_volume.unwrap_or(0.0) * units as f64;
        remaining_isk -= cost;
        hop_profit += item_profit;
        hop_cost += cost;
        items.push((item_profit, units, cost, opp));
    }

    (!items.is_empty()).then_some(HopCandidate { buy_system_id, sell_system_id, items, hop_profit, hop_cost })
}

/// Runs `pack_hop` at each of `HOP_ISK_COMMIT_FRACTIONS` of `isk_budget`,
/// giving `dfs` a genuine choice at every hop between spending aggressively
/// right here and preserving ISK for whatever the rest of the route turns
/// up -- not just the single maximal-spend packing. `pack_hop` itself has
/// no notion of "later" -- it always fills as much of whatever budget it's
/// handed as it can -- so this is the only place that decision can be
/// introduced. Variants that end up buying the exact same items as a
/// larger one already produced (because supply or cargo capped the fill
/// before the smaller ISK ceiling even mattered) are dropped: they'd only
/// be redundant, strictly-dominated siblings in `find_hop_candidates`'s
/// output. Returned in descending-fraction order, so callers that just
/// want this pair's single best achievable profit (e.g. `find_hop_candidates`'s
/// pair-diversity ranking) can read it straight off `variants[0]`.
fn pack_hop_variants(
    buy_system_id: i32,
    sell_system_id: i32,
    opportunities: Vec<ArbitrageOpportunity>,
    isk_budget: f64,
    cargo_capacity_m3: f64,
) -> Vec<HopCandidate> {
    let mut variants: Vec<HopCandidate> = Vec::new();
    for &fraction in HOP_ISK_COMMIT_FRACTIONS {
        let Some(candidate) = pack_hop(buy_system_id, sell_system_id, opportunities.clone(), isk_budget * fraction, cargo_capacity_m3) else {
            continue;
        };
        let is_duplicate = variants.iter().any(|v: &HopCandidate| {
            v.items.len() == candidate.items.len()
                && v.items
                    .iter()
                    .zip(&candidate.items)
                    .all(|((_, units_a, _, opp_a), (_, units_b, _, opp_b))| units_a == units_b && opp_a.type_id == opp_b.type_id)
        });
        if !is_duplicate {
            variants.push(candidate);
        }
    }
    variants
}

/// Commits every item of one hop onto `route`, returning the extended copy.
fn extend_route_with_hop(route: &PartialRoute, hop: HopCandidate) -> PartialRoute {
    let mut next = route.clone();
    // See `PartialRoute::remaining_isk`'s doc comment -- the buy cost left
    // and came back (plus profit) the moment this hop's items sold, so the
    // net effect on cash-on-hand is `+= hop_profit`, not `-= hop_cost`.
    next.remaining_isk += hop.hop_profit;
    next.total_profit += hop.hop_profit;
    next.total_cost += hop.hop_cost;
    next.current_system_id = hop.sell_system_id;
    next.visited_system_ids.push(hop.buy_system_id);
    next.visited_system_ids.push(hop.sell_system_id);
    for (leg_profit, units, _cost, opp) in hop.items {
        next.legs.push(RoutePlanLeg {
            type_id: opp.type_id,
            type_name: opp.type_name,
            buy_system_id: opp.buy_system_id,
            buy_system_name: opp.buy_system_name,
            buy_security_status: opp.buy_security_status,
            sell_system_id: opp.sell_system_id,
            sell_system_name: opp.sell_system_name,
            sell_security_status: opp.sell_security_status,
            buy_price: opp.buy_price,
            sell_price: opp.sell_price,
            quantity: units,
            leg_profit,
            profit_pct: opp.profit_pct,
            jumps: None,
        });
    }
    next
}

/// A sound (never-underestimating) upper bound on how much profit a
/// single remaining hop could possibly contribute, used by `dfs`'s
/// branch-and-bound pruning -- the best `trip_profit` achievable *anywhere*
/// in the market for a full cargo hold, ignoring reachability from
/// wherever the search currently is, remaining ISK, and whether the same
/// opportunity could realistically be repeated hop after hop. Deliberately
/// loose (an upper bound only needs to never be too low, not tight) and
/// computed once per request rather than once per search node, which is
/// what makes it cheap enough to use as a pruning tool at all.
///
/// Still constrained by `allowed_security_classes`, though -- an
/// unconstrained bound would still be technically admissible (a superset's
/// max can only be >= a subset's), but needlessly loose for a
/// `high_sec_only`/`low_sec_plus` search, where it would otherwise get
/// dragged up by null-sec opportunities `dfs` could never actually select.
fn estimate_max_hop_profit(
    books: &MarketBooks,
    types: &[EligibleType],
    cargo_capacity_m3: f64,
    sales_tax_pct: f64,
    opp_filters: &OpportunityFilters,
) -> f64 {
    let filter = ArbitrageFilter {
        cargo_capacity_m3: Some(cargo_capacity_m3),
        require_bid_exceeds_offer: true,
        sales_tax_pct,
        buy_security_classes: opp_filters.buy_security_classes.clone(),
        sell_security_classes: opp_filters.sell_security_classes.clone(),
        min_buy_price: opp_filters.min_buy_price,
        max_buy_price: opp_filters.max_buy_price,
        min_sell_price: opp_filters.min_sell_price,
        max_sell_price: opp_filters.max_sell_price,
        min_profit_per_unit: opp_filters.min_profit_per_unit,
        min_profit_pct: opp_filters.min_profit_pct,
        min_volume_available: opp_filters.min_volume_available,
        max_total_cost: opp_filters.max_total_cost,
        exclude_system_ids: opp_filters.exclude_system_ids.clone(),
        ..Default::default()
    };
    books.find_opportunities(types, &filter).iter().filter_map(|o| o.trip_profit).fold(0.0, f64::max)
}

struct PlanRoutesParams {
    start_system_id: i32,
    target_system_id: Option<i32>,
    sell_corridor: Option<Vec<i32>>,
    cargo_capacity_m3: f64,
    isk_available: f64,
    max_legs: i32,
    max_results: i32,
    sales_tax_pct: f64,
    return_to_start: bool,
    opportunity_filters: OpportunityFilters,
}

/// Shared, read-only across the whole `dfs` recursion.
struct DfsConfig<'a> {
    books: &'a MarketBooks,
    types: &'a [EligibleType],
    cargo_capacity_m3: f64,
    max_legs: i32,
    sales_tax_pct: f64,
    return_to_start: bool,
    target_system_id: Option<i32>,
    sell_corridor: Option<Vec<i32>>,
    max_hop_profit: f64,
    max_results: usize,
    opportunity_filters: OpportunityFilters,
}

/// If `route` is a genuine candidate result -- non-empty, and, when
/// `return_to_start`/`target_system_id` asked for one, actually having
/// closed its loop or reached its destination -- inserts it into `best`,
/// keeping `best` sorted descending by profit and capped to
/// `cfg.max_results`. Every node visited during the search is a candidate,
/// not just leaves: a route that stops at 2 of a requested 4 legs because
/// nothing further was worth doing is still a completely valid, possibly
/// top-`max_results`, answer -- as is one that reaches `target_system_id`
/// early and could, in principle, keep going.
fn maybe_record(route: &PartialRoute, cfg: &DfsConfig, best: &mut Vec<PartialRoute>) {
    if route.legs.is_empty() {
        return;
    }
    // Never report a route that doesn't come out ahead. Individual hops
    // are already constrained to profitable pairs (`require_bid_exceeds_offer`),
    // but tax and a marginal final hop can still net out flat or negative;
    // those aren't results worth showing.
    if route.total_profit <= 0.0 {
        return;
    }
    if cfg.return_to_start && route.current_system_id != route.origin_system_id {
        return;
    }
    if let Some(target) = cfg.target_system_id
        && route.current_system_id != target
    {
        return;
    }
    best.push(route.clone());
    best.sort_by(|a, b| b.total_profit.partial_cmp(&a.total_profit).unwrap_or(Ordering::Equal));
    best.truncate(cfg.max_results);
}

/// The profit floor a branch must be able to *possibly* beat to be worth
/// exploring: the worst of the `max_results` best routes found so far,
/// or "no floor yet" until that many have actually been found (pruning
/// before then would risk returning fewer than `max_results` routes even
/// when more genuinely exist).
fn prune_threshold(best: &[PartialRoute], max_results: usize) -> f64 {
    if best.len() >= max_results { best.last().map(|r| r.total_profit).unwrap_or(f64::NEG_INFINITY) } else { f64::NEG_INFINITY }
}

/// Branch-and-bound depth-first search: at `route`'s current position,
/// record it as a candidate result (see `maybe_record`), then -- unless
/// `max_legs` or the node budget is exhausted -- fetch every reachable
/// next hop (see `find_hop_candidates`, which already knapsack-packs each
/// one's hold), and recurse into them **in best-first order**. Exploring
/// the most promising branch first is what makes the pruning below
/// effective: it tends to find a strong complete route early, which then
/// lets later, weaker siblings get cut before ever being expanded.
///
/// The cut itself: a branch's `upper_bound` is `route`'s current profit,
/// plus that specific hop's own (already-known, nothing to compute) profit,
/// plus an optimistic ceiling for whatever legs would still remain after
/// it (`remaining_legs * cfg.max_hop_profit`). If that bound can't beat
/// `prune_threshold`, this branch -- and, since candidates are sorted by
/// hop profit descending, every remaining sibling too -- is abandoned.
/// This is why the loop below `break`s rather than `continue`s past a
/// failing candidate.
///
/// `find_hop_candidates` already caps fan-out per node to
/// `MAX_CANDIDATES_PER_NODE` -- see that constant's doc comment for why
/// the profit bound alone can't do this job here (it structurally can't
/// prune while more than the very last leg remains). Within that cap,
/// though, this is still real branch-and-bound, not a beam search: the
/// bound above still prunes candidates it can rule out, no result is
/// finalized until the search backs all the way out, and a branch that
/// looked merely second-best after one hop can still be reconsidered
/// against its siblings, not locked in early. `MAX_NODES_EXPLORED` is a
/// separate, coarser backstop against the bound underperforming on a
/// pathological request, not a normal ceiling.
fn dfs(route: PartialRoute, depth: i32, cfg: &DfsConfig, best: &mut Vec<PartialRoute>, nodes_explored: &mut usize) {
    maybe_record(&route, cfg, best);

    if depth >= cfg.max_legs || *nodes_explored >= MAX_NODES_EXPLORED {
        return;
    }

    let must_sell_at = (cfg.return_to_start && depth == cfg.max_legs - 1).then_some(route.origin_system_id);
    let candidates = find_hop_candidates(
        cfg.books,
        cfg.types,
        &route,
        cfg.cargo_capacity_m3,
        cfg.sales_tax_pct,
        must_sell_at,
        cfg.sell_corridor.as_deref(),
        &cfg.opportunity_filters,
    );
    *nodes_explored += 1;

    let remaining_legs_after = (cfg.max_legs - depth - 1) as f64;
    for hop in candidates {
        if *nodes_explored >= MAX_NODES_EXPLORED {
            break;
        }
        let upper_bound = route.total_profit + hop.hop_profit + remaining_legs_after * cfg.max_hop_profit;
        if upper_bound <= prune_threshold(best, cfg.max_results) {
            break;
        }
        let next = extend_route_with_hop(&route, hop);
        dfs(next, depth + 1, cfg, best, nodes_explored);
    }
}

fn plan_routes(books: &MarketBooks, types: &[EligibleType], params: PlanRoutesParams) -> Vec<RoutePlan> {
    let PlanRoutesParams {
        start_system_id,
        target_system_id,
        sell_corridor,
        cargo_capacity_m3,
        isk_available,
        max_legs,
        max_results,
        sales_tax_pct,
        return_to_start,
        opportunity_filters,
    } = params;

    let max_hop_profit = estimate_max_hop_profit(books, types, cargo_capacity_m3, sales_tax_pct, &opportunity_filters);
    let cfg = DfsConfig {
        books,
        types,
        cargo_capacity_m3,
        max_legs,
        sales_tax_pct,
        return_to_start,
        target_system_id,
        sell_corridor,
        max_hop_profit,
        max_results: max_results as usize,
        opportunity_filters,
    };

    let seed = PartialRoute {
        current_system_id: start_system_id,
        origin_system_id: start_system_id,
        remaining_isk: isk_available,
        // Deliberately NOT seeded with `start_system_id` -- `find_hop_candidates`
        // would then simultaneously require the first hop's buy system to
        // be `start_system_id` (via `include_buy_system_ids`) and forbid it
        // (via `exclude_system_ids`, built from this list), a self-
        // contradictory filter guaranteed to return nothing. `extend_route_with_hop`
        // pushes the first hop's buy system onto this list once it's
        // actually committed, so `start_system_id` lands here naturally
        // (and later hops correctly can't revisit it) at that point.
        visited_system_ids: Vec::new(),
        legs: Vec::new(),
        total_profit: 0.0,
        total_cost: 0.0,
    };

    let mut best: Vec<PartialRoute> = Vec::new();
    let mut nodes_explored = 0usize;
    dfs(seed, 0, &cfg, &mut best, &mut nodes_explored);

    best.into_iter()
        .map(|r| RoutePlan { total_cost: r.total_cost, total_profit: r.total_profit, total_jumps: None, legs: r.legs })
        .collect()
}

/// Same batching idea as routes/arbitrage.rs's `fill_jumps`: group every
/// leg across every returned plan by its buy system, one
/// `distances_to_targets` search per distinct buy system rather than one
/// per leg.
fn fill_route_jumps(plans: &mut [RoutePlan], graph: &JumpGraph, multipliers: SecurityMultipliers) {
    let mut targets_by_buy_system: HashMap<i32, HashSet<i32>> = HashMap::new();
    for plan in plans.iter() {
        for leg in &plan.legs {
            targets_by_buy_system.entry(leg.buy_system_id).or_default().insert(leg.sell_system_id);
        }
    }

    let distances_by_buy_system: HashMap<i32, HashMap<i32, i32>> = targets_by_buy_system
        .into_iter()
        .map(|(buy_system_id, targets)| (buy_system_id, graph.distances_to_targets(buy_system_id, &targets, multipliers)))
        .collect();

    for plan in plans.iter_mut() {
        let mut total_jumps = Some(0);
        // A hop's several items (see `pack_hop`) all share one buy/sell
        // pair and are pushed as consecutive legs -- `last_hop` dedupes
        // them here so a 3-item hop's jump distance is counted once
        // toward `total_jumps`, not three times.
        let mut last_hop: Option<(i32, i32)> = None;
        for leg in &mut plan.legs {
            leg.jumps = distances_by_buy_system.get(&leg.buy_system_id).and_then(|d| d.get(&leg.sell_system_id)).copied();
            let hop = (leg.buy_system_id, leg.sell_system_id);
            if last_hop != Some(hop) {
                total_jumps = match (total_jumps, leg.jumps) {
                    (Some(acc), Some(j)) => Some(acc + j),
                    _ => None,
                };
                last_hop = Some(hop);
            }
        }
        plan.total_jumps = total_jumps;
    }
}
