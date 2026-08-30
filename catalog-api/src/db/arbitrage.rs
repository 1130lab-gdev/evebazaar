use std::cmp::Ordering;

use deadpool_postgres::Pool;

use crate::{domain::ArbitrageOpportunity, error::AppError};

/// The full candidate set is capped here, not by the caller's requested
/// page size -- sorting (including by `jumps`/`isk_per_jump`, which need
/// the jump graph and so can't be computed in this query at all) and
/// pagination both happen in Rust afterward, over the whole capped set,
/// so every sort field ranks across the true candidate pool instead of
/// just whatever page a SQL-side ORDER BY would have produced first. Well
/// above any observed real candidate count (~3k unfiltered) as a safety
/// valve against a pathological no-filter request, not a normal ceiling.
const CANDIDATE_CAP: i64 = 8000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArbitrageSortField {
    TypeName,
    PackagedVolume,
    BuySystemName,
    SellSystemName,
    BuyPrice,
    SellPrice,
    ProfitPerUnit,
    ProfitPct,
    VolumeAvailable,
    Jumps,
    IskPerJump,
    /// Only meaningful when `cargo_capacity_m3` is set -- otherwise every
    /// row's `trip_profit` is NULL and this degenerates to an arbitrary
    /// (but stable) order.
    TripProfit,
    /// Only meaningful when `from_system_id` is set -- same NULL caveat as
    /// `TripProfit`.
    DistanceFromLocation,
}

impl ArbitrageSortField {
    /// `None` always sorts last, in both directions -- `desc` only flips
    /// the ordering among the `Some` values, matching the SQL query's own
    /// `ORDER BY ... NULLS LAST` convention for `trip_profit` and
    /// `distance_from_location` (see `find_opportunities`'s doc comment
    /// for why that mattered there); kept consistent here since jumps and
    /// isk_per_jump are just as often NULL (unreachable pair, or no jump
    /// count at all) and the same surprise -- unknowns outranking real
    /// numbers -- would otherwise resurface for those two fields instead.
    fn cmp_option<T: PartialOrd>(a: Option<T>, b: Option<T>, desc: bool) -> Ordering {
        match (a, b) {
            (None, None) => Ordering::Equal,
            (None, Some(_)) => Ordering::Greater,
            (Some(_), None) => Ordering::Less,
            (Some(a), Some(b)) => {
                let ord = a.partial_cmp(&b).unwrap_or(Ordering::Equal);
                if desc { ord.reverse() } else { ord }
            }
        }
    }

    fn cmp_value<T: PartialOrd>(a: T, b: T, desc: bool) -> Ordering {
        let ord = a.partial_cmp(&b).unwrap_or(Ordering::Equal);
        if desc { ord.reverse() } else { ord }
    }

    pub fn compare(self, a: &ArbitrageOpportunity, b: &ArbitrageOpportunity, desc: bool) -> Ordering {
        match self {
            Self::TypeName => Self::cmp_value(&a.type_name, &b.type_name, desc),
            Self::PackagedVolume => Self::cmp_option(a.packaged_volume, b.packaged_volume, desc),
            Self::BuySystemName => Self::cmp_value(&a.buy_system_name, &b.buy_system_name, desc),
            Self::SellSystemName => Self::cmp_value(&a.sell_system_name, &b.sell_system_name, desc),
            Self::BuyPrice => Self::cmp_value(a.buy_price, b.buy_price, desc),
            Self::SellPrice => Self::cmp_value(a.sell_price, b.sell_price, desc),
            Self::ProfitPerUnit => Self::cmp_value(a.profit_per_unit, b.profit_per_unit, desc),
            Self::ProfitPct => Self::cmp_value(a.profit_pct, b.profit_pct, desc),
            Self::VolumeAvailable => Self::cmp_value(a.volume_available, b.volume_available, desc),
            Self::Jumps => Self::cmp_option(a.jumps, b.jumps, desc),
            Self::IskPerJump => Self::cmp_option(a.isk_per_jump, b.isk_per_jump, desc),
            Self::TripProfit => Self::cmp_option(a.trip_profit, b.trip_profit, desc),
            Self::DistanceFromLocation => Self::cmp_option(a.distance_from_location, b.distance_from_location, desc),
        }
    }
}

/// `Default` gives every field its "no constraint" value (`None`/empty/
/// `false`) except `sales_tax_pct`, which lands on `0.0` -- fine for
/// callers that build a filter with `..Default::default()` and then
/// explicitly set the fields they care about (the route planner does
/// this), but anyone returning a filter straight from `Default` without
/// overriding `sales_tax_pct` would silently compute pre-tax profit.
#[derive(Debug, Default)]
pub struct ArbitrageFilter {
    /// pg_trgm fuzzy match against `types.name`, same retrieval as `/search`.
    pub name_query: Option<String>,
    pub category_ids: Option<Vec<i32>>,
    pub market_group_ids: Option<Vec<i32>>,
    /// When set, the buy system must be one of these -- e.g. putting just
    /// Jita in this list surfaces every opportunity that starts there,
    /// regardless of where it sells. Independent of `include_sell_system_ids`:
    /// setting both constrains each side separately rather than requiring
    /// both systems to come from one shared list (which would make a
    /// single-system list impossible to match at all, since the buy and
    /// sell systems are never the same).
    pub include_buy_system_ids: Option<Vec<i32>>,
    /// Same as `include_buy_system_ids`, but for the sell system.
    pub include_sell_system_ids: Option<Vec<i32>>,
    /// When set, neither the buy system nor the sell system may be in this
    /// list -- e.g. "never route through nullsec".
    pub exclude_system_ids: Option<Vec<i32>>,
    pub buy_security_classes: Option<Vec<String>>,
    pub sell_security_classes: Option<Vec<String>>,
    pub min_buy_price: Option<f64>,
    pub max_buy_price: Option<f64>,
    pub min_sell_price: Option<f64>,
    pub max_sell_price: Option<f64>,
    pub min_profit_per_unit: Option<f64>,
    pub min_profit_pct: Option<f64>,
    pub min_volume_available: Option<i64>,
    /// Cost to buy out the entire available stack at the buy system's best
    /// price (`buy_price * buy_volume_available`), capped at this ISK
    /// figure -- lets a trader with limited capital exclude opportunities
    /// they couldn't fully capitalize on anyway.
    pub max_total_cost: Option<f64>,
    /// Ship (or hauler) cargo hold size, cubic meters. When set, each row's
    /// `trip_profit` is computed: how many units of this item actually fit
    /// in that hold (`floor(cargo_capacity_m3 / packaged_volume)`), capped
    /// by whatever's actually available on both sides of the trade, times
    /// profit per unit -- "if I filled my whole hold with this item right
    /// now, what would I clear on the run." Lets a caller sort by
    /// `TripProfit` to find the single best cargo for a fixed hold size,
    /// which is a different ranking than `ProfitPerUnit` or `ProfitPct`
    /// alone (a high per-unit margin on a bulky item can lose to a lower
    /// margin on something that packs densely).
    pub cargo_capacity_m3: Option<f64>,
    /// Parallel to `location_distances`: every system_id reachable from
    /// the request's `from_system_id`, paired positionally with its
    /// jump-distance in `location_distances`. Both empty when no location
    /// was set. Precomputed by the route handler from the cached jump
    /// graph (a single Dijkstra) rather than in SQL -- see
    /// `AppState::jump_graph`.
    pub location_system_ids: Vec<i32>,
    pub location_distances: Vec<i32>,
    /// Only applied when `from_system_id` was actually set -- see the
    /// route handler, which refuses to honor this alone (it would filter
    /// out every row, since `distance_from_location` is NULL for all of
    /// them without a location to measure from).
    pub max_jumps_from_location: Option<i32>,
    /// The opportunity only exists right now if the sell system's best buy
    /// order, after tax, actually outbids the buy system's best sell
    /// order. Turning this off surfaces pairs where that's not (yet) true,
    /// for browsing "close but not profitable" spreads -- but with no
    /// undercut-margin metric computed here, a `false` row's
    /// `profit_per_unit` will simply read negative.
    pub require_bid_exceeds_offer: bool,
    /// EVE deducts this percentage from the ISK you receive when a sell
    /// order fills (selling into an existing buy order), not from what you
    /// pay to buy -- see `ArbitrageOpportunity::net_sell_price`. The exact
    /// rate depends on the trader's skills and standings, so this is a
    /// caller-supplied estimate, not a computed value; the route handler
    /// defaults it to 7.5% (a reasonable un-optimized rate) when the
    /// request doesn't specify one, rather than defaulting to 0% and
    /// silently overstating every profit figure in the app.
    pub sales_tax_pct: f64,
    /// Drop items that are illegal to haul in most of empire space --
    /// matched by group name (`Booster`-family groups and `Slaves`), the
    /// only stored signal, since there's no per-type contraband flag in
    /// this schema. A coarse cut, not a per-empire contraband list.
    pub exclude_illegal: bool,
}

/// Finds, for each tradeable item, the single best cross-system buy-low
/// pairing: the cheapest live sell order anywhere among eligible systems
/// against the highest live buy order anywhere among eligible systems (a
/// different system). One row per item, not one row per system-pair --
/// comparing every eligible system against every other for every item is
/// an O(systems^2) join that's intractable at this table's scale (the
/// first version of this query did exactly that and didn't return in
/// under two minutes against ~1.6M live rows). Taking the type-level best
/// on each side first via `DISTINCT ON` bounds the final join to at most
/// one row per item -- a few thousand, not hundreds of thousands -- and
/// is also the more useful product shape: a trader wants the best flip
/// for an item, not every mediocre system pair for it.
///
/// Returns the full (capped) candidate set, not a page: the caller
/// (routes/arbitrage.rs) still needs to fill in `jumps`/`isk_per_jump`
/// from the cached jump graph, then sort and paginate over the complete
/// set -- SQL-side `ORDER BY`/`LIMIT`/`OFFSET` would only have produced
/// the top page under *some* field, not the one the caller actually asked
/// to sort by, since jump-derived fields don't exist yet at this point.
///
/// System/security eligibility filters are applied *inside*
/// `eligible_sell`/`eligible_buy`, before the per-item best is taken --
/// otherwise "best" could pick a system the caller asked to exclude, with
/// the exclusion only trimming results after the fact instead of actually
/// constraining the search.
///
/// Every CTE is `MATERIALIZED` deliberately: Postgres 12+ will otherwise
/// inline the small `best_sell`/`best_buy`/`sell_volume`/`buy_volume` CTEs
/// into the outer query and re-evaluate the (still large) `eligible_*`
/// scans once per outer-loop row instead of once total -- turned a ~1.5s
/// query into a ~20s one during development, verified with EXPLAIN
/// ANALYZE. Don't remove `MATERIALIZED` without re-checking that.
///
/// Runs inside a transaction with `enable_nestloop` turned off for that
/// transaction only (`SET LOCAL`, which reverts automatically at commit
/// and never touches the pooled connection's session state for whatever
/// query reuses it next): without real statistics on a MATERIALIZED CTE's
/// output, Postgres badly underestimates the final type_id join between
/// `best_sell`+`sell_volume` and `best_buy`+`buy_volume` and picks Nested
/// Loop, which -- with security-class filters narrowing the CTEs enough to
/// trigger it -- measured at 59s against real data instead of ~1.5s with
/// Hash Join. Verified with EXPLAIN ANALYZE; re-check before removing.
///
/// `distance_from_location` comes from `location_distances`, a table
/// built by `unnest`-ing the two parallel arrays the route handler passes
/// in (system_ids, their jump-distance from `from_system_id`) rather than
/// computed here -- BFS over the stargate graph isn't something SQL can do
/// against `market_orders`, so it's precomputed once in Rust (see
/// `AppState::jump_graph`) and joined in as if it were a lookup table.
///
/// With every filter left at its default (an unusual combination in
/// practice -- most requests narrow by at least a name, price, profit, or
/// security filter), `eligible_sell`/`eligible_buy` scan `market_orders`'
/// full ~1.6M rows with no index to help, which measured at ~2-3s;
/// realistic filtered requests were consistently under 1s in the same
/// testing. Raising Postgres's `work_mem` didn't meaningfully help (the
/// scan itself dominates, not the sort that follows it) -- the real fix
/// would be a covering index on `market_orders (is_buy_order, type_id,
/// price)`, which wasn't added here since it's a write-path cost on a
/// table the sibling `database` project owns and rewrites on every
/// ~5-minute sync poll, not something to add unilaterally from this side.
pub async fn find_opportunities(pool: &Pool, filter: &ArbitrageFilter) -> Result<Vec<ArbitrageOpportunity>, AppError> {
    let mut client = pool.get().await?;
    let txn = client.transaction().await?;
    txn.batch_execute("SET LOCAL enable_nestloop = off").await?;

    let sql = "WITH eligible_sell AS MATERIALIZED (
             SELECT mo.type_id, mo.system_id, mo.price, mo.volume_remain
             FROM market_orders mo
             JOIN solar_systems ss ON ss.system_id = mo.system_id
             WHERE mo.is_buy_order = false
               AND ($1::int[] IS NULL OR mo.system_id = ANY($1))
               AND ($3::int[] IS NULL OR mo.system_id <> ALL($3))
               AND ($4::text[] IS NULL OR
                    (CASE WHEN ss.security_status >= 0.5 THEN 'highsec'
                          WHEN ss.security_status > 0.0 THEN 'lowsec'
                          ELSE 'nullsec' END) = ANY($4))
         ),
         eligible_buy AS MATERIALIZED (
             SELECT mo.type_id, mo.system_id, mo.price, mo.volume_remain
             FROM market_orders mo
             JOIN solar_systems ss ON ss.system_id = mo.system_id
             WHERE mo.is_buy_order = true
               AND ($2::int[] IS NULL OR mo.system_id = ANY($2))
               AND ($3::int[] IS NULL OR mo.system_id <> ALL($3))
               AND ($5::text[] IS NULL OR
                    (CASE WHEN ss.security_status >= 0.5 THEN 'highsec'
                          WHEN ss.security_status > 0.0 THEN 'lowsec'
                          ELSE 'nullsec' END) = ANY($5))
         ),
         best_sell AS MATERIALIZED (
             SELECT DISTINCT ON (type_id) type_id, system_id, price
             FROM eligible_sell
             ORDER BY type_id, price ASC
         ),
         best_buy AS MATERIALIZED (
             SELECT DISTINCT ON (type_id) type_id, system_id, price,
                    price * (1.0 - $23::float8 / 100.0) AS net_price
             FROM eligible_buy
             ORDER BY type_id, price DESC
         ),
         sell_volume AS MATERIALIZED (
             SELECT bs.type_id, SUM(es.volume_remain)::bigint AS volume_available
             FROM best_sell bs
             JOIN eligible_sell es ON es.type_id = bs.type_id AND es.system_id = bs.system_id AND es.price = bs.price
             GROUP BY bs.type_id
         ),
         buy_volume AS MATERIALIZED (
             SELECT bb.type_id, SUM(eb.volume_remain)::bigint AS volume_available
             FROM best_buy bb
             JOIN eligible_buy eb ON eb.type_id = bb.type_id AND eb.system_id = bb.system_id AND eb.price = bb.price
             GROUP BY bb.type_id
         ),
         location_distances AS MATERIALIZED (
             SELECT * FROM unnest($19::int[], $20::int[]) AS t(system_id, distance)
         )
         SELECT
             t.type_id, t.name AS type_name, c.category_id, c.name AS category_name,
             t.market_group_id, t.packaged_volume,
             bs.system_id AS buy_system_id, ssb.name AS buy_system_name, ssb.region_id AS buy_region_id,
             rb.name AS buy_region_name, ssb.security_status AS buy_security_status,
             bs.price AS buy_price, sv.volume_available AS buy_volume_available,
             bb.system_id AS sell_system_id, sss.name AS sell_system_name, sss.region_id AS sell_region_id,
             rs.name AS sell_region_name, sss.security_status AS sell_security_status,
             bb.price AS sell_price, bv.volume_available AS sell_volume_available,
             bb.net_price AS net_sell_price,
             (bb.net_price - bs.price) AS profit_per_unit,
             ((bb.net_price - bs.price) / bs.price * 100.0) AS profit_pct,
             LEAST(sv.volume_available, bv.volume_available) AS volume_available,
             CASE
                 WHEN $18::float8 IS NULL OR t.packaged_volume IS NULL OR t.packaged_volume <= 0 THEN NULL
                 ELSE LEAST(FLOOR($18 / t.packaged_volume), sv.volume_available, bv.volume_available) * (bb.net_price - bs.price)
             END AS trip_profit,
             ld.distance AS distance_from_location
         FROM best_sell bs
         JOIN best_buy bb
             ON bb.type_id = bs.type_id
            AND bb.system_id <> bs.system_id
            AND ($6::bool = false OR bb.net_price > bs.price)
         JOIN sell_volume sv ON sv.type_id = bs.type_id
         JOIN buy_volume bv ON bv.type_id = bb.type_id
         JOIN types t ON t.type_id = bs.type_id
         JOIN groups g ON g.group_id = t.group_id
         JOIN categories c ON c.category_id = g.category_id
         JOIN solar_systems ssb ON ssb.system_id = bs.system_id
         JOIN regions rb ON rb.region_id = ssb.region_id
         JOIN solar_systems sss ON sss.system_id = bb.system_id
         JOIN regions rs ON rs.region_id = sss.region_id
         LEFT JOIN location_distances ld ON ld.system_id = bs.system_id
         WHERE t.published
           AND ($7::text IS NULL OR t.name % $7)
           AND ($8::int[] IS NULL OR c.category_id = ANY($8))
           AND ($9::int[] IS NULL OR t.market_group_id = ANY($9))
           AND ($10::float8 IS NULL OR bs.price >= $10)
           AND ($11::float8 IS NULL OR bs.price <= $11)
           AND ($12::float8 IS NULL OR bb.price >= $12)
           AND ($13::float8 IS NULL OR bb.price <= $13)
           AND ($14::float8 IS NULL OR (bb.net_price - bs.price) >= $14)
           AND ($15::float8 IS NULL OR ((bb.net_price - bs.price) / bs.price * 100.0) >= $15)
           AND ($16::bigint IS NULL OR LEAST(sv.volume_available, bv.volume_available) >= $16)
           AND ($17::float8 IS NULL OR bs.price * sv.volume_available <= $17)
           AND ($21::int IS NULL OR ld.distance <= $21)
           AND ($24::bool = false OR NOT (LOWER(g.name) LIKE '%booster%' OR LOWER(g.name) = 'slaves'))
         LIMIT $22";

    let rows = txn
        .query(
            sql,
            &[
                &filter.include_buy_system_ids,
                &filter.include_sell_system_ids,
                &filter.exclude_system_ids,
                &filter.buy_security_classes,
                &filter.sell_security_classes,
                &filter.require_bid_exceeds_offer,
                &filter.name_query,
                &filter.category_ids,
                &filter.market_group_ids,
                &filter.min_buy_price,
                &filter.max_buy_price,
                &filter.min_sell_price,
                &filter.max_sell_price,
                &filter.min_profit_per_unit,
                &filter.min_profit_pct,
                &filter.min_volume_available,
                &filter.max_total_cost,
                &filter.cargo_capacity_m3,
                &filter.location_system_ids,
                &filter.location_distances,
                &filter.max_jumps_from_location,
                &CANDIDATE_CAP,
                &filter.sales_tax_pct,
                &filter.exclude_illegal,
            ],
        )
        .await?;

    txn.commit().await?;

    Ok(rows
        .into_iter()
        .map(|r| ArbitrageOpportunity {
            type_id: r.get(0),
            type_name: r.get(1),
            category_id: r.get(2),
            category_name: r.get(3),
            market_group_id: r.get(4),
            packaged_volume: r.get(5),
            buy_system_id: r.get(6),
            buy_system_name: r.get(7),
            buy_region_id: r.get(8),
            buy_region_name: r.get(9),
            buy_security_status: r.get(10),
            buy_price: r.get(11),
            buy_volume_available: r.get(12),
            sell_system_id: r.get(13),
            sell_system_name: r.get(14),
            sell_region_id: r.get(15),
            sell_region_name: r.get(16),
            sell_security_status: r.get(17),
            sell_price: r.get(18),
            sell_volume_available: r.get(19),
            net_sell_price: r.get(20),
            profit_per_unit: r.get(21),
            profit_pct: r.get(22),
            volume_available: r.get(23),
            trip_profit: r.get(24),
            distance_from_location: r.get(25),
            // Filled in by the route handler from the cached jump graph --
            // not something SQL against market_orders/types has any way
            // to compute.
            jumps: None,
            isk_per_jump: None,
        })
        .collect())
}

/// Current best price for one item at one specific buy system and one
/// specific sell system -- a live quote for exactly the pair a caller
/// already picked, not a search. The route planner uses this: it already
/// knows which item/systems it wants priced at each step and just needs
/// the numbers, not another market-wide search.
pub struct LegQuote {
    pub buy_price: f64,
    pub sell_price: f64,
    pub net_sell_price: f64,
    /// `min(buy-side, sell-side)` available at the best price on each
    /// side, same meaning as `ArbitrageOpportunity::volume_available`.
    pub available_volume: i64,
}

pub async fn quote_leg(
    pool: &Pool,
    type_id: i32,
    buy_system_id: i32,
    sell_system_id: i32,
    sales_tax_pct: f64,
) -> Result<Option<LegQuote>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "WITH buy_side AS (
                 SELECT MIN(price) AS price FROM market_orders
                 WHERE type_id = $1 AND system_id = $2 AND is_buy_order = false
             ),
             sell_side AS (
                 SELECT MAX(price) AS price FROM market_orders
                 WHERE type_id = $1 AND system_id = $3 AND is_buy_order = true
             ),
             buy_volume AS (
                 SELECT COALESCE(SUM(mo.volume_remain), 0)::bigint AS volume
                 FROM market_orders mo, buy_side
                 WHERE mo.type_id = $1 AND mo.system_id = $2 AND mo.is_buy_order = false AND mo.price = buy_side.price
             ),
             sell_volume AS (
                 SELECT COALESCE(SUM(mo.volume_remain), 0)::bigint AS volume
                 FROM market_orders mo, sell_side
                 WHERE mo.type_id = $1 AND mo.system_id = $3 AND mo.is_buy_order = true AND mo.price = sell_side.price
             )
             SELECT buy_side.price, sell_side.price, buy_volume.volume, sell_volume.volume
             FROM types t
             JOIN solar_systems ssb ON ssb.system_id = $2
             JOIN solar_systems sss ON sss.system_id = $3
             CROSS JOIN buy_side
             CROSS JOIN sell_side
             CROSS JOIN buy_volume
             CROSS JOIN sell_volume
             WHERE t.type_id = $1",
            &[&type_id, &buy_system_id, &sell_system_id],
        )
        .await?;

    let Some(row) = row else { return Ok(None) };
    let buy_price: Option<f64> = row.get(0);
    let sell_price: Option<f64> = row.get(1);
    let (Some(buy_price), Some(sell_price)) = (buy_price, sell_price) else {
        return Ok(None); // no live order on one side or the other right now
    };
    let buy_volume: i64 = row.get(2);
    let sell_volume: i64 = row.get(3);

    Ok(Some(LegQuote {
        buy_price,
        sell_price,
        net_sell_price: sell_price * (1.0 - sales_tax_pct / 100.0),
        available_volume: buy_volume.min(sell_volume),
    }))
}
