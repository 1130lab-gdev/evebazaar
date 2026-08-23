use std::time::SystemTime;

use anyhow::{Context, Result};
use rfesi::groups::MarketOrder;
use time::format_description::well_known::Rfc3339;
use tokio_postgres::Client;

/// Upserts a region's whole order book in a single round trip, bumping
/// `last_seen` to now on both insert and update. Parameters are passed as
/// parallel arrays and expanded with `UNNEST` so one order book (tens to
/// hundreds of thousands of orders for busy regions) doesn't cost one
/// network round trip per row. `region_id` isn't on `MarketOrder` -- ESI
/// scopes the whole response by the region requested, so the caller
/// supplies it.
pub async fn upsert_market_orders(
    client: &Client,
    orders: &[MarketOrder],
    region_id: i32,
) -> Result<()> {
    if orders.is_empty() {
        return Ok(());
    }

    let mut order_ids = Vec::with_capacity(orders.len());
    let mut system_ids = Vec::with_capacity(orders.len());
    let mut type_ids = Vec::with_capacity(orders.len());
    let mut location_ids = Vec::with_capacity(orders.len());
    let mut is_buy_orders = Vec::with_capacity(orders.len());
    let mut prices = Vec::with_capacity(orders.len());
    let mut volume_remains = Vec::with_capacity(orders.len());
    let mut volume_totals = Vec::with_capacity(orders.len());
    let mut min_volumes = Vec::with_capacity(orders.len());
    let mut durations = Vec::with_capacity(orders.len());
    let mut issueds = Vec::with_capacity(orders.len());
    let mut ranges = Vec::with_capacity(orders.len());

    for order in orders {
        let issued: SystemTime = time::OffsetDateTime::parse(&order.issued, &Rfc3339)
            .with_context(|| format!("parsing issued timestamp {}", order.issued))?
            .into();

        order_ids.push(order.order_id);
        system_ids.push(order.system_id);
        type_ids.push(order.type_id);
        location_ids.push(order.location_id);
        is_buy_orders.push(order.is_buy_order);
        prices.push(order.price);
        volume_remains.push(order.volume_remain);
        volume_totals.push(order.volume_total);
        min_volumes.push(order.min_volume);
        durations.push(order.duration);
        issueds.push(issued);
        ranges.push(order.range.clone());
    }

    client
        .execute(
            "INSERT INTO market_orders (
                order_id, region_id, system_id, type_id, location_id, is_buy_order,
                price, volume_remain, volume_total, min_volume, duration, issued,
                range, last_seen
             )
             SELECT
                order_id, $13::int, system_id, type_id, location_id, is_buy_order,
                price, volume_remain, volume_total, min_volume, duration, issued,
                range, now()
             FROM UNNEST(
                $1::bigint[], $2::int[], $3::int[], $4::bigint[], $5::bool[],
                $6::double precision[], $7::int[], $8::int[], $9::int[],
                $10::int[], $11::timestamptz[], $12::text[]
             ) AS t(
                order_id, system_id, type_id, location_id, is_buy_order,
                price, volume_remain, volume_total, min_volume, duration,
                issued, range
             )
             ON CONFLICT (order_id) DO UPDATE SET
                region_id = EXCLUDED.region_id,
                system_id = EXCLUDED.system_id,
                type_id = EXCLUDED.type_id,
                location_id = EXCLUDED.location_id,
                is_buy_order = EXCLUDED.is_buy_order,
                price = EXCLUDED.price,
                volume_remain = EXCLUDED.volume_remain,
                volume_total = EXCLUDED.volume_total,
                min_volume = EXCLUDED.min_volume,
                duration = EXCLUDED.duration,
                issued = EXCLUDED.issued,
                range = EXCLUDED.range,
                last_seen = now()",
            &[
                &order_ids,
                &system_ids,
                &type_ids,
                &location_ids,
                &is_buy_orders,
                &prices,
                &volume_remains,
                &volume_totals,
                &min_volumes,
                &durations,
                &issueds,
                &ranges,
                &region_id,
            ],
        )
        .await?;
    Ok(())
}

/// Deletes orders for `region_id` that weren't touched by the poll that
/// started at `since` -- i.e. orders that were filled, cancelled, or expired
/// since the last poll and so didn't show up in this one.
pub async fn delete_stale_orders(
    client: &Client,
    region_id: i32,
    since: SystemTime,
) -> Result<u64> {
    let deleted = client
        .execute(
            "DELETE FROM market_orders WHERE region_id = $1 AND last_seen < $2",
            &[&region_id, &since],
        )
        .await?;
    Ok(deleted)
}
