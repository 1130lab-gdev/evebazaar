use std::collections::HashMap;

use deadpool_postgres::Pool;

use crate::{domain::PriceWatch, error::AppError};

fn is_triggered(current_price: Option<f64>, reference_price: f64, threshold_pct: f64) -> bool {
    current_price.map(|p| p >= reference_price * (1.0 + threshold_pct / 100.0)).unwrap_or(false)
}

/// Highest live buy order per type, batched into one query rather than one
/// per watch -- the same `(is_buy_order, type_id, price)` covering index
/// `find_opportunities` relies on makes this an index-only scan regardless
/// of how many `type_ids` are passed.
async fn best_buy_prices(pool: &Pool, type_ids: &[i32]) -> Result<HashMap<i32, f64>, AppError> {
    if type_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT type_id, MAX(price) FROM market_orders WHERE is_buy_order = true AND type_id = ANY($1) GROUP BY type_id",
            &[&type_ids],
        )
        .await?;
    Ok(rows.into_iter().map(|r| (r.get(0), r.get(1))).collect())
}

pub async fn list_price_watches(pool: &Pool) -> Result<Vec<PriceWatch>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT pw.watch_id, pw.type_id, t.name, pw.reference_price, pw.threshold_pct, pw.created_at, pw.updated_at
             FROM catalog_api.price_watches pw
             JOIN types t ON t.type_id = pw.type_id
             ORDER BY t.name",
            &[],
        )
        .await?;

    let type_ids: Vec<i32> = rows.iter().map(|r| r.get(1)).collect();
    let current_prices = best_buy_prices(pool, &type_ids).await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let type_id: i32 = r.get(1);
            let reference_price: f64 = r.get(3);
            let threshold_pct: f64 = r.get(4);
            let current_price = current_prices.get(&type_id).copied();
            PriceWatch {
                watch_id: r.get(0),
                type_id,
                type_name: r.get(2),
                reference_price,
                threshold_pct,
                current_price,
                triggered: is_triggered(current_price, reference_price, threshold_pct),
                created_at: r.get(5),
                updated_at: r.get(6),
            }
        })
        .collect())
}

/// Shared by `create_price_watch`/`update_price_watch` -- both already have
/// `type_id`/`reference_price`/`threshold_pct` in hand from the row they
/// just wrote, but still need the type's name and a fresh price lookup to
/// build a complete `PriceWatch` to return.
async fn enrich(
    pool: &Pool,
    watch_id: i64,
    type_id: i32,
    reference_price: f64,
    threshold_pct: f64,
    created_at: time::OffsetDateTime,
    updated_at: time::OffsetDateTime,
) -> Result<PriceWatch, AppError> {
    let client = pool.get().await?;
    let type_name: String = client.query_one("SELECT name FROM types WHERE type_id = $1", &[&type_id]).await?.get(0);
    let current_price = best_buy_prices(pool, &[type_id]).await?.get(&type_id).copied();
    Ok(PriceWatch {
        watch_id,
        type_id,
        type_name,
        reference_price,
        threshold_pct,
        current_price,
        triggered: is_triggered(current_price, reference_price, threshold_pct),
        created_at,
        updated_at,
    })
}

pub async fn create_price_watch(pool: &Pool, type_id: i32, reference_price: f64, threshold_pct: f64) -> Result<PriceWatch, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_one(
            "INSERT INTO catalog_api.price_watches (type_id, reference_price, threshold_pct)
             VALUES ($1, $2, $3)
             RETURNING watch_id, created_at, updated_at",
            &[&type_id, &reference_price, &threshold_pct],
        )
        .await?;
    enrich(pool, row.get(0), type_id, reference_price, threshold_pct, row.get(1), row.get(2)).await
}

pub async fn update_price_watch(pool: &Pool, watch_id: i64, reference_price: f64, threshold_pct: f64) -> Result<Option<PriceWatch>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "UPDATE catalog_api.price_watches SET reference_price = $2, threshold_pct = $3, updated_at = now()
             WHERE watch_id = $1
             RETURNING type_id, created_at, updated_at",
            &[&watch_id, &reference_price, &threshold_pct],
        )
        .await?;
    let Some(row) = row else { return Ok(None) };
    Ok(Some(enrich(pool, watch_id, row.get(0), reference_price, threshold_pct, row.get(1), row.get(2)).await?))
}

pub async fn delete_price_watch(pool: &Pool, watch_id: i64) -> Result<bool, AppError> {
    let client = pool.get().await?;
    let deleted = client.execute("DELETE FROM catalog_api.price_watches WHERE watch_id = $1", &[&watch_id]).await?;
    Ok(deleted > 0)
}
