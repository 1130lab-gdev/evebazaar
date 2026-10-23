use std::collections::{HashMap, HashSet};

use deadpool_postgres::Pool;
use futures_util::{StreamExt, pin_mut};

use crate::{db::arbitrage::ArbitrageFilter, domain::ArbitrageOpportunity, error::AppError};

/// One system's best price for one item on one side of the market, with
/// the total `volume_remain` of every order tied at that price -- the same
/// system-level aggregate `find_opportunities`' `best_sell`/`sell_volume`
/// (and buy-side equivalents) compute in SQL.
#[derive(Debug, Clone, Copy)]
pub struct Level {
    pub system_id: i32,
    pub price: f64,
    pub volume: i64,
}

pub struct SystemInfo {
    pub name: String,
    pub region_id: i32,
    pub region_name: String,
    pub security_status: f64,
}

/// Same three-way split as `find_opportunities`' `CASE` expression.
fn security_class(security_status: f64) -> &'static str {
    if security_status >= 0.5 {
        "highsec"
    } else if security_status > 0.0 {
        "lowsec"
    } else {
        "nullsec"
    }
}

/// Every system's best ask and best bid for every item, held in memory so
/// the route planner's branch-and-bound search can evaluate each node
/// without a query. `db::arbitrage::find_opportunities` re-scans and
/// re-sorts the full ~1.6M-row `market_orders` table on every call (~1s);
/// the planner used to make one such call per search node, up to
/// `MAX_NODES_EXPLORED` of them. This is loaded with a single streamed
/// scan instead (see `AppState::market_books` for how long one is reused).
pub struct MarketBooks {
    systems: HashMap<i32, SystemInfo>,
    /// Per type, every system's best (lowest) ask, cheapest first.
    asks_by_type: HashMap<i32, Vec<Level>>,
    /// Per type, every system's best (highest) bid, highest first.
    bids_by_type: HashMap<i32, Vec<Level>>,
}

impl MarketBooks {
    pub async fn load(pool: &Pool) -> Result<Self, AppError> {
        let client = pool.get().await?;

        let systems = client
            .query(
                "SELECT ss.system_id, ss.name, ss.region_id, r.name, ss.security_status
                 FROM solar_systems ss JOIN regions r ON r.region_id = ss.region_id",
                &[],
            )
            .await?
            .into_iter()
            .map(|r| {
                let info = SystemInfo { name: r.get(1), region_id: r.get(2), region_name: r.get(3), security_status: r.get(4) };
                (r.get::<_, i32>(0), info)
            })
            .collect::<HashMap<_, _>>();

        // (type_id, system_id, is_buy_order) -> best level. Streamed rather
        // than collected into a Vec<Row> first: it's the whole table.
        let mut best: HashMap<(i32, i32, bool), Level> = HashMap::new();
        let stream = client
            .query_raw(
                "SELECT type_id, system_id, is_buy_order, price, volume_remain FROM market_orders",
                std::iter::empty::<i32>(),
            )
            .await?;
        pin_mut!(stream);
        while let Some(row) = stream.next().await {
            let row = row?;
            let system_id: i32 = row.get(1);
            if !systems.contains_key(&system_id) {
                continue; // same as the SQL's inner join on solar_systems
            }
            let is_buy: bool = row.get(2);
            let price: f64 = row.get(3);
            let volume = row.get::<_, i32>(4) as i64;
            best.entry((row.get(0), system_id, is_buy))
                .and_modify(|level| {
                    let better = if is_buy { price > level.price } else { price < level.price };
                    if better {
                        *level = Level { system_id, price, volume };
                    } else if price == level.price {
                        level.volume += volume;
                    }
                })
                .or_insert(Level { system_id, price, volume });
        }

        let mut asks_by_type: HashMap<i32, Vec<Level>> = HashMap::new();
        let mut bids_by_type: HashMap<i32, Vec<Level>> = HashMap::new();
        for ((type_id, _, is_buy), level) in best {
            if is_buy { &mut bids_by_type } else { &mut asks_by_type }.entry(type_id).or_default().push(level);
        }
        // Ties broken by system_id so the pick is deterministic; the SQL's
        // `DISTINCT ON` picks an arbitrary one of the tied rows.
        for levels in asks_by_type.values_mut() {
            levels.sort_by(|a, b| a.price.total_cmp(&b.price).then(a.system_id.cmp(&b.system_id)));
        }
        for levels in bids_by_type.values_mut() {
            levels.sort_by(|a, b| b.price.total_cmp(&a.price).then(a.system_id.cmp(&b.system_id)));
        }

        Ok(Self { systems, asks_by_type, bids_by_type })
    }

    /// In-memory equivalent of `db::arbitrage::find_opportunities` for the
    /// route planner, over `types` (see `load_eligible_types`, which has
    /// already applied the filter's type-level constraints: name, category,
    /// market group, published, illegal). Every system/security/price/
    /// profit/volume constraint in `filter` is applied here with the same
    /// semantics as the SQL, including its quirk that the best bid is
    /// picked first and the item dropped if that bid sits in the ask's own
    /// system, rather than falling back to the next-best bid elsewhere.
    ///
    /// The location fields (`location_*`, `max_jumps_from_location`) are
    /// not supported -- the planner never sets them -- and neither is
    /// `find_opportunities`' `CANDIDATE_CAP`, a response-size safety valve
    /// that doesn't apply to an in-process caller.
    pub fn find_opportunities(&self, types: &[EligibleType], filter: &ArbitrageFilter) -> Vec<ArbitrageOpportunity> {
        debug_assert!(filter.location_system_ids.is_empty() && filter.max_jumps_from_location.is_none());

        let to_set = |ids: &Option<Vec<i32>>| ids.as_ref().map(|ids| ids.iter().copied().collect::<HashSet<i32>>());
        let include_buy = to_set(&filter.include_buy_system_ids);
        let include_sell = to_set(&filter.include_sell_system_ids);
        let exclude = to_set(&filter.exclude_system_ids);

        let eligible = |level: &Level, include: &Option<HashSet<i32>>, classes: &Option<Vec<String>>| -> bool {
            if include.as_ref().is_some_and(|ids| !ids.contains(&level.system_id)) {
                return false;
            }
            if exclude.as_ref().is_some_and(|ids| ids.contains(&level.system_id)) {
                return false;
            }
            match classes {
                None => true,
                Some(classes) => {
                    let class = security_class(self.systems[&level.system_id].security_status);
                    classes.iter().any(|c| c == class)
                }
            }
        };

        let tax_factor = 1.0 - filter.sales_tax_pct / 100.0;
        let mut out = Vec::new();
        for t in types {
            let (Some(asks), Some(bids)) = (self.asks_by_type.get(&t.type_id), self.bids_by_type.get(&t.type_id)) else {
                continue;
            };
            let Some(ask) = asks.iter().find(|l| eligible(l, &include_buy, &filter.buy_security_classes)) else {
                continue;
            };
            let Some(bid) = bids.iter().find(|l| eligible(l, &include_sell, &filter.sell_security_classes)) else {
                continue;
            };
            if bid.system_id == ask.system_id {
                continue;
            }

            let net_price = bid.price * tax_factor;
            let profit_per_unit = net_price - ask.price;
            let profit_pct = profit_per_unit / ask.price * 100.0;
            let volume_available = ask.volume.min(bid.volume);
            if filter.require_bid_exceeds_offer && net_price <= ask.price {
                continue;
            }
            let at_least = |value: f64, bound: Option<f64>| bound.is_none_or(|b| value >= b);
            let at_most = |value: f64, bound: Option<f64>| bound.is_none_or(|b| value <= b);
            if !(at_least(ask.price, filter.min_buy_price)
                && at_most(ask.price, filter.max_buy_price)
                && at_least(bid.price, filter.min_sell_price)
                && at_most(bid.price, filter.max_sell_price)
                && at_least(profit_per_unit, filter.min_profit_per_unit)
                && at_least(profit_pct, filter.min_profit_pct)
                && at_most(ask.price * ask.volume as f64, filter.max_total_cost)
                && filter.min_volume_available.is_none_or(|min| volume_available >= min))
            {
                continue;
            }

            let trip_profit = match (filter.cargo_capacity_m3, t.packaged_volume) {
                (Some(cargo), Some(pv)) if pv > 0.0 => {
                    Some((cargo / pv).floor().min(ask.volume as f64).min(bid.volume as f64) * profit_per_unit)
                }
                _ => None,
            };
            let buy_system = &self.systems[&ask.system_id];
            let sell_system = &self.systems[&bid.system_id];
            out.push(ArbitrageOpportunity {
                type_id: t.type_id,
                type_name: t.name.clone(),
                category_id: t.category_id,
                category_name: t.category_name.clone(),
                market_group_id: t.market_group_id,
                packaged_volume: t.packaged_volume,
                buy_system_id: ask.system_id,
                buy_system_name: buy_system.name.clone(),
                buy_region_id: buy_system.region_id,
                buy_region_name: buy_system.region_name.clone(),
                buy_security_status: buy_system.security_status,
                buy_price: ask.price,
                buy_volume_available: ask.volume,
                sell_system_id: bid.system_id,
                sell_system_name: sell_system.name.clone(),
                sell_region_id: sell_system.region_id,
                sell_region_name: sell_system.region_name.clone(),
                sell_security_status: sell_system.security_status,
                sell_price: bid.price,
                sell_volume_available: bid.volume,
                net_sell_price: net_price,
                profit_per_unit,
                profit_pct,
                volume_available,
                trip_profit,
                distance_from_location: None,
                jumps: None,
                isk_per_jump: None,
            });
        }
        out
    }
}

/// A type that passed the request's type-level filters, with the metadata
/// an `ArbitrageOpportunity` reports for it.
pub struct EligibleType {
    pub type_id: i32,
    pub name: String,
    pub category_id: i32,
    pub category_name: String,
    pub market_group_id: Option<i32>,
    pub packaged_volume: Option<f64>,
}

/// The type-level half of `find_opportunities`' WHERE clause, run once per
/// route search: published, name (pg_trgm `%`, so kept in SQL rather than
/// reimplemented), category, market group, and the illegal-goods cut.
/// Ordered by type_id so a search over the result is deterministic.
pub async fn load_eligible_types(
    pool: &Pool,
    name_query: Option<&str>,
    category_ids: Option<&[i32]>,
    market_group_ids: Option<&[i32]>,
    exclude_illegal: bool,
) -> Result<Vec<EligibleType>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT t.type_id, t.name, c.category_id, c.name, t.market_group_id, t.packaged_volume
             FROM types t
             JOIN groups g ON g.group_id = t.group_id
             JOIN categories c ON c.category_id = g.category_id
             WHERE t.published
               AND ($1::text IS NULL OR t.name % $1)
               AND ($2::int[] IS NULL OR c.category_id = ANY($2))
               AND ($3::int[] IS NULL OR t.market_group_id = ANY($3))
               AND ($4::bool = false OR NOT (LOWER(g.name) LIKE '%booster%' OR LOWER(g.name) = 'slaves'))
             ORDER BY t.type_id",
            &[&name_query, &category_ids, &market_group_ids, &exclude_illegal],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| EligibleType {
            type_id: r.get(0),
            name: r.get(1),
            category_id: r.get(2),
            category_name: r.get(3),
            market_group_id: r.get(4),
            packaged_volume: r.get(5),
        })
        .collect())
}
