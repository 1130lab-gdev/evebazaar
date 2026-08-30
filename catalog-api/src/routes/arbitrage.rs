use std::collections::{HashMap, HashSet};

use axum::{Json, extract::State};
// See the same import in routes/orders.rs: axum::extract::Query can't
// deserialize a repeated query key into a Vec, axum_extra's can.
use axum_extra::extract::Query;
use serde::Deserialize;

use crate::{
    db::{
        self,
        arbitrage::ArbitrageSortField,
        jumps::{JumpGraph, SecurityMultipliers},
    },
    domain::ArbitrageOpportunity,
    error::AppResult,
    state::AppState,
};

const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 200;
const DEFAULT_SALES_TAX_PCT: f64 = 7.5;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ArbitrageParams {
    /// Fuzzy item name match, same retrieval as `/search`.
    pub q: Option<String>,
    #[serde(default)]
    pub category_id: Vec<i32>,
    #[serde(default)]
    pub market_group_id: Vec<i32>,
    /// The buy system must be one of these, when given -- independent of
    /// `include_sell_system_id`, so putting one system in this list alone
    /// surfaces every opportunity buying there, regardless of sell system.
    #[serde(default)]
    pub include_buy_system_id: Vec<i32>,
    /// Same as `include_buy_system_id`, but for the sell system.
    #[serde(default)]
    pub include_sell_system_id: Vec<i32>,
    /// Neither the buy nor the sell system may be in this list.
    #[serde(default)]
    pub exclude_system_id: Vec<i32>,
    #[serde(default)]
    pub buy_security_class: Vec<String>,
    #[serde(default)]
    pub sell_security_class: Vec<String>,
    pub min_buy_price: Option<f64>,
    pub max_buy_price: Option<f64>,
    pub min_sell_price: Option<f64>,
    pub max_sell_price: Option<f64>,
    /// Minimum profit per unit, ISK.
    pub min_profit: Option<f64>,
    pub min_profit_pct: Option<f64>,
    pub min_volume: Option<i64>,
    /// Caps `buy_price * buy_volume_available` -- cost to buy out the
    /// entire available stack at the buy system's best price.
    pub max_total_cost: Option<f64>,
    /// Ship/hauler cargo hold size, cubic meters. When set, each row gets a
    /// `trip_profit` figure and `sort_by=trip_profit` becomes meaningful.
    pub cargo_capacity_m3: Option<f64>,
    /// Defaults to true: only show pairs where the sell system's best buy
    /// order currently outbids the buy system's best sell order (i.e. an
    /// instant flip is actually executable right now).
    pub require_bid_exceeds_offer: Option<bool>,
    /// Percent EVE deducts from the sell side when a sell order fills.
    /// Defaults to 7.5 (a reasonable un-optimized rate) rather than 0,
    /// since every profit figure in the response is computed net of this
    /// -- silently defaulting to 0 would overstate real, take-home profit
    /// on every row.
    pub sales_tax_pct: Option<f64>,
    /// When true, drop items that are illegal to haul in most of empire
    /// space (boosters and slaves, matched by group name -- the only
    /// stored signal). Defaults to false.
    pub exclude_illegal: Option<bool>,
    /// One of `profit`, `profit_pct`, `volume`, `buy_price`, `sell_price`,
    /// `name`, `size`, `buy_system`, `sell_system`, `jumps`, `isk_per_jump`,
    /// `trip_profit`, `distance_from_location`. Defaults to `profit`.
    pub sort_by: Option<String>,
    /// Defaults to true (highest first) -- false for ascending.
    pub sort_desc: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    /// The trader's current system. When set, every row gets a
    /// `distance_from_location` (jumps to the buy system), and
    /// `sort_by=distance_from_location` becomes meaningful.
    pub from_system_id: Option<i32>,
    /// Only show opportunities whose buy system is within this many jumps
    /// of `from_system_id`. Ignored (not just a no-op filter, silently
    /// dropped) if `from_system_id` isn't also set -- see the handler.
    pub max_jumps_from_location: Option<i32>,
    /// One of `fastest` (default, no security preference), `high_sec_only`,
    /// `low_sec_plus` -- same vocabulary and meaning as map-api's `/route`
    /// `profile` param. Biases both `jumps` (buy system to sell system) and
    /// `distance_from_location`: a hauler who won't fly through nullsec
    /// wants "how many jumps avoiding that", not the raw shortest path.
    pub security_profile: Option<String>,
}

fn parse_sort_field(value: Option<&str>) -> ArbitrageSortField {
    match value {
        Some("profit_pct") => ArbitrageSortField::ProfitPct,
        Some("volume") => ArbitrageSortField::VolumeAvailable,
        Some("buy_price") => ArbitrageSortField::BuyPrice,
        Some("sell_price") => ArbitrageSortField::SellPrice,
        Some("name") => ArbitrageSortField::TypeName,
        Some("size") => ArbitrageSortField::PackagedVolume,
        Some("buy_system") => ArbitrageSortField::BuySystemName,
        Some("sell_system") => ArbitrageSortField::SellSystemName,
        Some("jumps") => ArbitrageSortField::Jumps,
        Some("isk_per_jump") => ArbitrageSortField::IskPerJump,
        Some("trip_profit") => ArbitrageSortField::TripProfit,
        Some("distance_from_location") => ArbitrageSortField::DistanceFromLocation,
        _ => ArbitrageSortField::ProfitPerUnit,
    }
}

/// Fills in `jumps`/`isk_per_jump` for every candidate. Two passes:
/// first collect, per distinct buy system, the exact set of sell systems
/// candidates from it actually need (usually 1-2, even though a busy hub
/// might be the buy system for hundreds of items); then run one
/// `distances_to_targets` search per buy system against just that set,
/// rather than one `distances_from` per buy system against the whole
/// graph -- see that method's doc comment for why the difference matters
/// at this table's scale (630 distinct buy systems in an unfiltered
/// request, each a full ~8.5k-system graph otherwise).
fn fill_jumps(opportunities: &mut [ArbitrageOpportunity], graph: &JumpGraph, multipliers: SecurityMultipliers) {
    let mut targets_by_buy_system: HashMap<i32, HashSet<i32>> = HashMap::new();
    for o in opportunities.iter() {
        targets_by_buy_system.entry(o.buy_system_id).or_default().insert(o.sell_system_id);
    }

    let distances_by_buy_system: HashMap<i32, HashMap<i32, i32>> = targets_by_buy_system
        .into_iter()
        .map(|(buy_system_id, targets)| (buy_system_id, graph.distances_to_targets(buy_system_id, &targets, multipliers)))
        .collect();

    for o in opportunities {
        o.jumps = distances_by_buy_system.get(&o.buy_system_id).and_then(|d| d.get(&o.sell_system_id)).copied();
        o.isk_per_jump = o
            .jumps
            .filter(|&j| j > 0)
            .map(|j| o.profit_per_unit * o.volume_available as f64 / j as f64);
    }
}

#[utoipa::path(
    get,
    path = "/market/arbitrage",
    tag = "arbitrage",
    params(ArbitrageParams),
    responses((status = 200, description = "Cross-system buy-low-sell-high opportunities", body = Vec<ArbitrageOpportunity>)),
)]
pub async fn list_opportunities(
    State(state): State<AppState>,
    Query(params): Query<ArbitrageParams>,
) -> AppResult<Json<Vec<ArbitrageOpportunity>>> {
    // Fetched once up front (not per-purpose) -- both the location-distance
    // arrays below and fill_jumps read from the same cached graph.
    let graph = state.jump_graph().await?;
    let multipliers = SecurityMultipliers::from_profile(params.security_profile.as_deref());

    // Precomputed here, not in SQL: Dijkstra over the stargate graph isn't
    // something a query against market_orders can do. A single
    // single-source search covers every opportunity's buy system in one
    // pass, rather than one search per row.
    let (location_system_ids, location_distances): (Vec<i32>, Vec<i32>) = match params.from_system_id {
        Some(from) => graph.distances_from(from, multipliers).into_iter().unzip(),
        None => (Vec::new(), Vec::new()),
    };
    // Silently dropped rather than forwarded as a filter that would zero
    // out every row: distance_from_location is NULL for every row unless
    // from_system_id is also set, and NULL <= N is never true in SQL.
    let max_jumps_from_location = params.from_system_id.and(params.max_jumps_from_location);

    let filter = db::arbitrage::ArbitrageFilter {
        name_query: params.q.filter(|q| !q.trim().is_empty()).map(|q| q.trim().to_string()),
        category_ids: (!params.category_id.is_empty()).then_some(params.category_id),
        market_group_ids: (!params.market_group_id.is_empty()).then_some(params.market_group_id),
        include_buy_system_ids: (!params.include_buy_system_id.is_empty()).then_some(params.include_buy_system_id),
        include_sell_system_ids: (!params.include_sell_system_id.is_empty()).then_some(params.include_sell_system_id),
        exclude_system_ids: (!params.exclude_system_id.is_empty()).then_some(params.exclude_system_id),
        buy_security_classes: (!params.buy_security_class.is_empty()).then_some(params.buy_security_class),
        sell_security_classes: (!params.sell_security_class.is_empty()).then_some(params.sell_security_class),
        min_buy_price: params.min_buy_price,
        max_buy_price: params.max_buy_price,
        min_sell_price: params.min_sell_price,
        max_sell_price: params.max_sell_price,
        min_profit_per_unit: params.min_profit,
        min_profit_pct: params.min_profit_pct,
        min_volume_available: params.min_volume,
        max_total_cost: params.max_total_cost,
        cargo_capacity_m3: params.cargo_capacity_m3,
        location_system_ids,
        location_distances,
        max_jumps_from_location,
        require_bid_exceeds_offer: params.require_bid_exceeds_offer.unwrap_or(true),
        sales_tax_pct: params.sales_tax_pct.unwrap_or(DEFAULT_SALES_TAX_PCT),
        exclude_illegal: params.exclude_illegal.unwrap_or(false),
    };
    let mut opportunities = db::arbitrage::find_opportunities(&state.db, &filter).await?;
    fill_jumps(&mut opportunities, graph, multipliers);

    let sort_field = parse_sort_field(params.sort_by.as_deref());
    let sort_desc = params.sort_desc.unwrap_or(true);
    opportunities.sort_by(|a, b| sort_field.compare(a, b, sort_desc));

    let offset = params.offset.unwrap_or(0).max(0) as usize;
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT) as usize;
    let page: Vec<ArbitrageOpportunity> = opportunities.into_iter().skip(offset).take(limit).collect();

    Ok(Json(page))
}
