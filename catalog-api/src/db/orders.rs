use deadpool_postgres::Pool;

use crate::{domain::MarketOrder, error::AppError};

#[derive(Debug, Default)]
pub struct OrderFilter {
    pub region_ids: Option<Vec<i32>>,
    /// `Some(true)` = buy orders only, `Some(false)` = sell orders only,
    /// `None` = both.
    pub is_buy_order: Option<bool>,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub min_volume_remain: Option<i32>,
    /// Buckets derived from `solar_systems.security_status` at query time --
    /// no stored column for it, so filtering means recomputing the bucket
    /// in SQL rather than joining against one.
    pub security_classes: Option<Vec<String>>,
    pub limit: i64,
    pub offset: i64,
}

pub async fn list_for_type(pool: &Pool, type_id: i32, filter: &OrderFilter) -> Result<Vec<MarketOrder>, AppError> {
    let client = pool.get().await?;

    // Ordering depends on which side is being shown: best bid first for
    // buy orders (highest price), best ask first for sell orders (lowest
    // price). With both sides shown there's no single "best" direction, so
    // default to price ascending -- the frontend table is sortable anyway,
    // this is just the initial view.
    let order_by = match filter.is_buy_order {
        Some(true) => "mo.price DESC",
        Some(false) => "mo.price ASC",
        None => "mo.price ASC",
    };

    let sql = format!(
        "SELECT mo.order_id, mo.type_id, mo.is_buy_order, mo.price, mo.volume_remain,
                mo.volume_total, mo.min_volume, mo.range, mo.issued,
                mo.region_id, r.name, mo.system_id, ss.name, ss.security_status,
                st.station_id, st.name
         FROM market_orders mo
         JOIN regions r ON r.region_id = mo.region_id
         JOIN solar_systems ss ON ss.system_id = mo.system_id
         LEFT JOIN stations st ON st.station_id = mo.location_id
         WHERE mo.type_id = $1
           AND ($2::int[] IS NULL OR mo.region_id = ANY($2))
           AND ($3::bool IS NULL OR mo.is_buy_order = $3)
           AND ($4::float8 IS NULL OR mo.price >= $4)
           AND ($5::float8 IS NULL OR mo.price <= $5)
           AND ($6::int IS NULL OR mo.volume_remain >= $6)
           AND ($7::text[] IS NULL OR
                (CASE WHEN ss.security_status >= 0.5 THEN 'highsec'
                      WHEN ss.security_status > 0.0 THEN 'lowsec'
                      ELSE 'nullsec' END) = ANY($7))
         ORDER BY {order_by}
         LIMIT $8 OFFSET $9"
    );

    let rows = client
        .query(
            &sql,
            &[
                &type_id,
                &filter.region_ids,
                &filter.is_buy_order,
                &filter.min_price,
                &filter.max_price,
                &filter.min_volume_remain,
                &filter.security_classes,
                &filter.limit,
                &filter.offset,
            ],
        )
        .await?;

    Ok(rows
        .into_iter()
        .map(|r| MarketOrder {
            order_id: r.get(0),
            type_id: r.get(1),
            is_buy_order: r.get(2),
            price: r.get(3),
            volume_remain: r.get(4),
            volume_total: r.get(5),
            min_volume: r.get(6),
            range: r.get(7),
            issued: r.get(8),
            region_id: r.get(9),
            region_name: r.get(10),
            system_id: r.get(11),
            system_name: r.get(12),
            security_status: r.get(13),
            station_id: r.get(14),
            station_name: r.get(15),
        })
        .collect())
}
