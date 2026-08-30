use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Category {
    pub category_id: i32,
    pub name: String,
}

/// Flat list -- `parent_group_id` lets the client build the tree itself
/// rather than this service doing recursive SQL.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MarketGroup {
    pub market_group_id: i32,
    pub parent_group_id: Option<i32>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Region {
    pub region_id: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SearchResult {
    pub type_id: i32,
    pub name: String,
    pub group_id: i32,
    pub market_group_id: Option<i32>,
    /// pg_trgm similarity score for this match against the query, 0..1.
    /// Exposed so a future reranker's ordering can be compared against the
    /// stage-1 retrieval score it started from.
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TypeDetail {
    pub type_id: i32,
    pub name: String,
    pub description: String,
    pub group_id: i32,
    pub group_name: String,
    pub category_id: i32,
    pub category_name: String,
    pub market_group_id: Option<i32>,
    pub volume: Option<f64>,
    pub packaged_volume: Option<f64>,
    pub mass: Option<f64>,
    pub published: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MarketOrder {
    pub order_id: i64,
    pub type_id: i32,
    pub is_buy_order: bool,
    pub price: f64,
    pub volume_remain: i32,
    pub volume_total: i32,
    pub min_volume: i32,
    pub range: String,
    #[serde(with = "time::serde::rfc3339")]
    pub issued: time::OffsetDateTime,
    pub region_id: i32,
    pub region_name: String,
    pub system_id: i32,
    pub system_name: String,
    pub security_status: f64,
    pub station_id: Option<i32>,
    pub station_name: Option<String>,
}

/// One buy-low-sell-high pairing: the cheapest live sell order for a type
/// in one system (`buy_*`, what a trader would pay to acquire it) against
/// the highest live buy order for the same type in a different system
/// (`sell_*`, what a trader would receive by filling it). Both sides are
/// system-level best-price aggregates, not individual orders -- a single
/// opportunity can represent many orders tied at the same best price on
/// either side, which is what `buy_volume_available`/`sell_volume_available`
/// sum.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArbitrageOpportunity {
    pub type_id: i32,
    pub type_name: String,
    pub category_id: i32,
    pub category_name: String,
    pub market_group_id: Option<i32>,
    /// Cubic meters per unit, for a client that wants to factor cargo
    /// capacity into a total-profit-per-trip figure. `None` for the rare
    /// type with no packaged_volume on record.
    pub packaged_volume: Option<f64>,

    pub buy_system_id: i32,
    pub buy_system_name: String,
    pub buy_region_id: i32,
    pub buy_region_name: String,
    pub buy_security_status: f64,
    pub buy_price: f64,
    /// Total volume_remain summed across every order tied at `buy_price`.
    pub buy_volume_available: i64,

    pub sell_system_id: i32,
    pub sell_system_name: String,
    pub sell_region_id: i32,
    pub sell_region_name: String,
    pub sell_security_status: f64,
    pub sell_price: f64,
    pub sell_volume_available: i64,
    /// `sell_price * (1 - sales_tax_pct / 100)` -- what filling the sell
    /// order actually pays out after EVE's sales tax, which is charged on
    /// the sell side only (selling into an existing buy order is a market
    /// transaction; buying from an existing sell order isn't taxed). Every
    /// profit figure below is computed from this, not the raw `sell_price`.
    pub net_sell_price: f64,

    /// `net_sell_price - buy_price` -- after sales tax, not the raw
    /// `sell_price - buy_price` spread.
    pub profit_per_unit: f64,
    /// `profit_per_unit / buy_price * 100`.
    pub profit_pct: f64,
    /// `min(buy_volume_available, sell_volume_available)` -- the largest
    /// quantity actually flippable at these exact best prices before one
    /// side runs out and the next-best price on that side would apply.
    pub volume_available: i64,
    /// Profit from filling a hold of the request's `cargo_capacity_m3`
    /// entirely with this item, capped by `volume_available` -- `None`
    /// when the request didn't set a cargo capacity, or this item has no
    /// `packaged_volume` on record. Built from the after-tax
    /// `profit_per_unit`, same as everything else here.
    pub trip_profit: Option<f64>,
    /// Jump count of the security-weighted route from `buy_system_id` to
    /// `sell_system_id` (see the request's `security_profile`; defaults to
    /// fewest jumps, ignoring security status entirely). `None` on the
    /// rare case the two systems aren't stargate-connected at all.
    pub jumps: Option<i32>,
    /// `profit_per_unit * volume_available / jumps` -- total profit if the
    /// full available volume were moved, spread across the jumps it takes
    /// to do it. `None` whenever `jumps` is (including `jumps == 0`, which
    /// can't happen for two systems the query guarantees are different,
    /// but is guarded against as a division-by-zero regardless).
    pub isk_per_jump: Option<f64>,
    /// Fewest-jumps stargate path from the request's `from_system_id` to
    /// `buy_system_id` -- "how far do I have to fly to even start this
    /// trade." `None` when the request didn't set a location, or the buy
    /// system isn't reachable from it.
    pub distance_from_location: Option<i32>,
}

/// One leg of a candidate multi-hop itinerary the route planner built.
/// `quantity` here is the largest affordable/cargo-fitting amount given
/// the plan's running ISK and hold constraints at this point in the
/// itinerary, not just "however much the market has available".
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RoutePlanLeg {
    pub type_id: i32,
    pub type_name: String,
    pub buy_system_id: i32,
    pub buy_system_name: String,
    pub buy_security_status: f64,
    pub sell_system_id: i32,
    pub sell_system_name: String,
    pub sell_security_status: f64,
    pub buy_price: f64,
    pub sell_price: f64,
    pub quantity: i64,
    pub leg_profit: f64,
    /// `ArbitrageOpportunity::profit_pct` for this leg's pairing --
    /// per-unit margin, independent of `quantity`.
    pub profit_pct: f64,
    /// Jump count of the security-weighted route from this leg's buy
    /// system to its sell system -- same semantics as
    /// `ArbitrageOpportunity::jumps`.
    pub jumps: Option<i32>,
}

/// One candidate multi-hop itinerary out of the route planner's ranked
/// results -- a beam-search approximation (see routes/route_planner.rs),
/// not a proven-optimal route; several of these come back per request so
/// the trader can pick among a handful of good options rather than being
/// handed a single black-box answer.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RoutePlan {
    pub legs: Vec<RoutePlanLeg>,
    pub total_profit: f64,
    pub total_cost: f64,
    /// `None` if any leg's jump count couldn't be determined (which would
    /// also mean that leg's own `jumps` is `None`).
    pub total_jumps: Option<i32>,
}

/// Answers "is this leg still good?" against the live market, for a leg
/// that was priced/sized at some point in the past -- a route plan's legs
/// are snapshots taken when they were built, deliberately never re-derived
/// from `market_orders` on their own read path, so this is the on-demand
/// escape hatch for "I planned this route 30 minutes ago, is it still
/// worth flying" without mutating the snapshot itself.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LegPriceCheck {
    /// `None` on every price/volume field below means there's no live
    /// order on one or both sides right now at all (order pulled or
    /// fully filled) -- distinct from "still there, but the price moved."
    pub current_buy_price: Option<f64>,
    pub current_sell_price: Option<f64>,
    /// `current_sell_price` net of sales tax -- what filling the sell
    /// order actually pays out right now, same convention as
    /// `ArbitrageOpportunity::net_sell_price`.
    pub current_net_sell_price: Option<f64>,
    pub current_profit_per_unit: Option<f64>,
    /// `min(buy-side, sell-side)` volume available at the current best
    /// price on each side -- may be less than the leg's saved `quantity`
    /// even when both sides still have *some* live order.
    pub current_available_volume: Option<i64>,
    /// A live order exists on both sides, `current_profit_per_unit > 0`,
    /// and `current_available_volume` covers the leg's saved `quantity`.
    pub still_viable: bool,
}
