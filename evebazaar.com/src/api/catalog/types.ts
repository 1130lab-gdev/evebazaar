// Mirrors ../../../../catalog-api/src/domain.rs. Keep in sync with that file.

export interface Category {
  category_id: number;
  name: string;
}

export interface MarketGroup {
  market_group_id: number;
  parent_group_id: number | null;
  name: string;
}

export interface Region {
  region_id: number;
  name: string;
}

export interface SearchResult {
  type_id: number;
  name: string;
  group_id: number;
  market_group_id: number | null;
  score: number;
}

export interface TypeDetail {
  type_id: number;
  name: string;
  description: string;
  group_id: number;
  group_name: string;
  category_id: number;
  category_name: string;
  market_group_id: number | null;
  volume: number | null;
  packaged_volume: number | null;
  mass: number | null;
  published: boolean;
}

export type SecurityClass = 'highsec' | 'lowsec' | 'nullsec';

export interface MarketOrder {
  order_id: number;
  type_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
  volume_total: number;
  min_volume: number;
  range: string;
  issued: string;
  region_id: number;
  region_name: string;
  system_id: number;
  system_name: string;
  security_status: number;
  station_id: number | null;
  station_name: string | null;
}

export interface OrderFilters {
  regionIds: number[];
  side: 'buy' | 'sell' | null;
  minPrice: number | null;
  maxPrice: number | null;
  minQty: number | null;
  securityClasses: SecurityClass[];
}

/** One item's single best cross-system buy-low-sell-high pairing. */
export interface ArbitrageOpportunity {
  type_id: number;
  type_name: string;
  category_id: number;
  category_name: string;
  market_group_id: number | null;
  packaged_volume: number | null;

  buy_system_id: number;
  buy_system_name: string;
  buy_region_id: number;
  buy_region_name: string;
  buy_security_status: number;
  buy_price: number;
  buy_volume_available: number;

  sell_system_id: number;
  sell_system_name: string;
  sell_region_id: number;
  sell_region_name: string;
  sell_security_status: number;
  sell_price: number;
  sell_volume_available: number;
  /** `sell_price * (1 - salesTaxPct / 100)` -- what filling the sell order
   * actually pays out after EVE's sales tax (charged on the sell side
   * only). `profit_per_unit` and everything derived from it are computed
   * from this, not the raw `sell_price`. */
  net_sell_price: number;

  /** After sales tax -- see `net_sell_price`. */
  profit_per_unit: number;
  profit_pct: number;
  volume_available: number;
  /** Profit from filling `cargo_capacity_m3` entirely with this item, capped
   * by `volume_available`. `null` when the request didn't set a cargo
   * capacity, or this item has no `packaged_volume` on record. */
  trip_profit: number | null;
  /** Jump count of the security-weighted route from the buy system to the
   * sell system (see `securityProfile`; defaults to fewest jumps, ignoring
   * security status). `null` on the rare case the two aren't
   * stargate-connected at all. */
  jumps: number | null;
  /** `profit_per_unit * volume_available / jumps`. `null` whenever `jumps`
   * is. */
  isk_per_jump: number | null;
  /** Fewest-jumps stargate path from the request's `fromSystemId` to the
   * buy system -- "how far do I have to fly to even start this trade."
   * `null` when the request didn't set a location. */
  distance_from_location: number | null;
}

export type ArbitrageSortField =
  | 'profit'
  | 'profit_pct'
  | 'volume'
  | 'buy_price'
  | 'sell_price'
  | 'name'
  | 'size'
  | 'buy_system'
  | 'sell_system'
  | 'jumps'
  | 'isk_per_jump'
  | 'trip_profit'
  | 'distance_from_location';

/** Same vocabulary as map-api's `/route` `profile` param. */
export type ArbitrageSecurityProfile = 'high_sec_only' | 'low_sec_plus';

export interface ArbitrageFilters {
  nameQuery: string;
  categoryIds: number[];
  marketGroupIds: number[];
  /** Buy system must be one of these, when non-empty -- independent of
   * `includeSellSystemIds`, so a single system here alone surfaces every
   * opportunity buying there regardless of where it sells. */
  includeBuySystemIds: number[];
  /** Same as `includeBuySystemIds`, but for the sell system. */
  includeSellSystemIds: number[];
  excludeSystemIds: number[];
  buySecurityClasses: SecurityClass[];
  sellSecurityClasses: SecurityClass[];
  minBuyPrice: number | null;
  maxBuyPrice: number | null;
  minSellPrice: number | null;
  maxSellPrice: number | null;
  minProfit: number | null;
  minProfitPct: number | null;
  minVolume: number | null;
  maxTotalCost: number | null;
  /** Ship/hauler cargo hold size, m³. Enables the `trip_profit` field and
   * `sortBy: 'trip_profit'`. */
  cargoCapacityM3: number | null;
  /** The trader's current system. Enables `distance_from_location` on each
   * row and `sortBy: 'distance_from_location'`. */
  fromSystemId: number | null;
  /** Only show opportunities whose buy system is within this many jumps of
   * `fromSystemId`. Ignored unless `fromSystemId` is also set. */
  maxJumpsFromLocation: number | null;
  /** Biases both `jumps` and `distance_from_location` -- '' (default) is
   * fewest jumps with no security preference. */
  securityProfile: ArbitrageSecurityProfile | '';
  /** Percent EVE deducts from the sell side when a sell order fills.
   * Every profit figure the server returns (`profit_per_unit`,
   * `profit_pct`, `trip_profit`, `isk_per_jump`) is computed net of this --
   * defaults to 7.5, a reasonable un-optimized rate, rather than 0, so
   * numbers reflect real take-home profit unless the trader knows their
   * actual (skill/standing-reduced) rate and enters it. */
  salesTaxPct: number;
  requireBidExceedsOffer: boolean;
  sortBy: ArbitrageSortField;
  sortDesc: boolean;
}

/** A saved trader profile -- cargo hold size and ISK on hand, fed into the
 * arbitrage scanner's cargo/budget fields and the route planner without
 * re-entering them every time. */
export interface Hauler {
  hauler_id: number;
  name: string;
  cargo_capacity_m3: number;
  isk_available: number;
  /** Saved route preference, fed as the route planner's (and, when this
   * hauler is selected, the arbitrage scanner's) securityProfile default.
   * `null` means fewest jumps. */
  route_security_profile: ArbitrageSecurityProfile | null;
  /** Default startSystemId (route planner) / fromSystemId (arbitrage
   * scanner) for this hauler, e.g. "I keep this hauler in Jita". `null`
   * means no default. */
  home_system_id: number | null;
  /** The owning freighter (exchange-webapi user id). `null` for haulers created before ownership existed. */
  owner_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus = 'planned' | 'in_progress' | 'completed' | 'abandoned';

/** One buy-here-sell-there leg of a run, in travel order. Every field is a
 * snapshot of prices/names taken when the run was saved -- not re-derived
 * from live data on read, so a run keeps showing what it looked like when
 * planned even after market prices move. */
export interface HaulerRunLeg {
  run_leg_id: number;
  leg_order: number;
  type_id: number;
  type_name: string;
  buy_system_id: number;
  buy_system_name: string;
  sell_system_id: number;
  sell_system_name: string;
  buy_price: number;
  sell_price: number;
  quantity: number;
  expected_profit: number;
  completed: boolean;
}

/** A route + trade plan pinned to a `Hauler`. */
export interface HaulerRun {
  run_id: number;
  hauler_id: number;
  name: string | null;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  legs: HaulerRunLeg[];
}

export interface HaulerRequest {
  name: string;
  cargo_capacity_m3: number;
  isk_available: number;
  route_security_profile: ArbitrageSecurityProfile | null;
  home_system_id: number | null;
}

export interface CreateRunLegRequest {
  type_id: number;
  buy_system_id: number;
  sell_system_id: number;
  /** Units to buy at this leg. Omit to auto-size against the hauler's full
   * stated cargo/ISK (see catalog-api's routes/haulers.rs for the exact
   * independent-per-leg sizing rule) -- a route-planner-built route should
   * always pass this explicitly instead, since the planner already
   * accounted for a depleting budget across legs. */
  quantity?: number;
}

export interface CreateRunRequest {
  name?: string;
  legs: CreateRunLegRequest[];
  sales_tax_pct?: number;
}

/** One leg of a candidate multi-hop itinerary the route planner built --
 * not yet saved to anything. `quantity` is the largest affordable/cargo-fitting
 * amount given the plan's running ISK and hold constraints at this point in
 * the itinerary. */
export interface RoutePlanLeg {
  type_id: number;
  type_name: string;
  buy_system_id: number;
  buy_system_name: string;
  buy_security_status: number;
  sell_system_id: number;
  sell_system_name: string;
  sell_security_status: number;
  buy_price: number;
  sell_price: number;
  quantity: number;
  leg_profit: number;
  /** Per-unit margin for this leg's pairing, independent of `quantity` --
   * same as `ArbitrageOpportunity.profit_pct`. */
  profit_pct: number;
  jumps: number | null;
}

/** One candidate multi-hop itinerary out of the route planner's ranked
 * results -- a beam-search approximation, not a proven-optimal route. */
export interface RoutePlan {
  legs: RoutePlanLeg[];
  total_profit: number;
  total_cost: number;
  /** `null` if any leg's jump count couldn't be determined. */
  total_jumps: number | null;
}

export interface RoutePlannerParams {
  /** Loads cargo_capacity_m3/isk_available from a saved hauler. Mutually
   * exclusive with cargoCapacityM3/iskAvailable -- if both are given, the
   * hauler wins. */
  haulerId: number | null;
  cargoCapacityM3: number | null;
  iskAvailable: number | null;
  /** Where the first leg must buy from -- required (falls back to the
   * selected hauler's home system server-side, if it has one, but manual
   * entry needs it set directly). */
  startSystemId: number | null;
  /** Where the route should end up, optional. When set, every hop's sell
   * side is confined to the shortest stargate path from startSystemId to
   * here -- profitable things to carry *along the way* from A to B, not
   * just from A. A route that reaches this system early still counts as
   * done; it isn't forced onto some particular leg. Mutually exclusive
   * with returnToStart. */
  targetSystemId: number | null;
  /** Number of buy-sell hops. Defaults to 3 server-side, clamped to 6. */
  maxLegs: number | null;
  /** How many of the best routes found to return. Defaults to 3
   * server-side, clamped to 5 -- purely a result-count/pruning-threshold
   * knob, not a search-width limit: the server's branch-and-bound search
   * explores every branch its profit bound doesn't rule out, not just
   * this many. */
  maxResults: number | null;
  /** Unlike the arbitrage scanner's identically-named field (which only
   * biases reported jump counts), this is a hard constraint here:
   * high_sec_only never buys or sells anywhere below 0.5 security,
   * low_sec_plus additionally allows low-sec but still excludes null-sec.
   * '' (default) applies no constraint. */
  securityProfile: ArbitrageSecurityProfile | '';
  salesTaxPct: number | null;
  /** Forces the last leg to sell back into wherever the route started,
   * instead of searching for the single best final destination. Requires
   * maxLegs >= 2. Mutually exclusive with targetSystemId. */
  returnToStart: boolean;
  // The rest mirror ArbitrageFilters field-for-field (see that interface's
  // doc comments) -- the same "which items are even eligible" constraints,
  // shared between opportunity browsing and route planning so a route
  // search can be scoped down exactly like the arbitrage scanner's own
  // filters ("only Ships", "min 5M profit", "never through this system").
  // In the merged Route Planner page these come from the same
  // ArbitrageFilterPanel instance the Opportunities tab uses, not a
  // second, separate set of inputs.
  nameQuery: string;
  categoryIds: number[];
  marketGroupIds: number[];
  minBuyPrice: number | null;
  maxBuyPrice: number | null;
  minSellPrice: number | null;
  maxSellPrice: number | null;
  minProfit: number | null;
  minProfitPct: number | null;
  minVolume: number | null;
  maxTotalCost: number | null;
  /** On top of (never replacing) the search's own visited-systems
   * exclusion. */
  excludeSystemIds: number[];
  /** Intersected server-side with whatever securityProfile already
   * implies, not a replacement for it. */
  buySecurityClasses: SecurityClass[];
  sellSecurityClasses: SecurityClass[];
}

/** A standing alert: "tell me when this item is worth more than I think it
 * is right now." `reference_price` is usually what was paid for stock
 * already on hand, though nothing enforces that. Triggers once the best
 * live buy order anywhere clears `reference_price * (1 + threshold_pct /
 * 100)` -- the buy side, since "what would someone pay me for this" is
 * what matters when deciding whether to sell something already owned. */
export interface PriceWatch {
  watch_id: number;
  type_id: number;
  type_name: string;
  reference_price: number;
  threshold_pct: number;
  /** Highest live buy order for this type, anywhere in the market. `null`
   * if nobody's currently buying it at all. */
  current_price: number | null;
  /** `current_price >= reference_price * (1 + threshold_pct / 100)`. */
  triggered: boolean;
  created_at: string;
  updated_at: string;
}

export interface PriceWatchRequest {
  type_id: number;
  reference_price: number;
  threshold_pct: number;
}

export interface UpdatePriceWatchRequest {
  reference_price: number;
  threshold_pct: number;
}

/** Answers "is this leg still good?" against the live market, for a leg
 * (a saved run's or an in-memory route plan's) that was priced/sized at
 * some point in the past and never re-derived from live orders on its own
 * read path. `null` on every price/volume field means no live order
 * exists on one or both sides at all right now (order pulled or fully
 * filled) -- distinct from "still there, but the price moved." */
export interface LegPriceCheck {
  current_buy_price: number | null;
  current_sell_price: number | null;
  current_net_sell_price: number | null;
  current_profit_per_unit: number | null;
  /** min(buy-side, sell-side) volume available at the current best price
   * -- may be less than the leg's quantity even when both sides still
   * have *some* live order. */
  current_available_volume: number | null;
  /** A live order exists on both sides, current_profit_per_unit > 0, and
   * current_available_volume covers the leg's quantity. */
  still_viable: boolean;
}

export interface PriceCheckLegRequest {
  type_id: number;
  buy_system_id: number;
  sell_system_id: number;
  quantity: number;
}

export interface PriceCheckRequest {
  legs: PriceCheckLegRequest[];
  sales_tax_pct?: number;
}
