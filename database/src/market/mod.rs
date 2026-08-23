use std::collections::{HashMap, HashSet};
use std::time::{Instant, SystemTime};

use anyhow::{Context, Result};
use rfesi::prelude::*;
use tokio_postgres::Client;
use tracing::{debug, info, instrument};

use crate::{db, taxonomy};

/// Syncs live market orders for every region already stored in `regions`
/// (populated by `universe::sync_all`, which must run first).
#[instrument(skip_all)]
pub async fn sync_all(esi: &Esi, client: &Client) -> Result<()> {
    let region_ids = db::universe::region_ids(client).await?;
    let total = region_ids.len();
    info!(total, "syncing market orders across regions");
    for (i, region_id) in region_ids.into_iter().enumerate() {
        info!(region_id, progress = i + 1, total, "syncing region orders");
        sync_region_orders(esi, client, region_id).await?;
    }
    info!(total, "market orders synced");
    Ok(())
}

/// Fetches every order in a region, matches each order's `type_id` against
/// `types` (backfilling via `taxonomy::ensure_type` if a type somehow isn't
/// synced yet, since `market_orders.type_id` is a foreign key), upserts the
/// current order book, and drops any previously-seen order that didn't show
/// up in this poll -- it was filled, cancelled, or expired since.
#[instrument(skip_all, fields(region_id))]
pub async fn sync_region_orders(esi: &Esi, client: &Client, region_id: i32) -> Result<()> {
    let poll_started = SystemTime::now();
    let region_started = Instant::now();

    let mut orders = Vec::new();
    let mut page = 1;
    loop {
        let result = esi
            .group_market()
            .get_region_orders(region_id, None, Some(page), None)
            .await;
        let Some(batch) = crate::esi::next_page(result)
            .with_context(|| format!("fetching orders for region {region_id} page {page}"))?
        else {
            break;
        };
        debug!(page, batch_len = batch.len(), "fetched order page");
        orders.extend(batch);
        page += 1;
    }
    info!(region_id, order_count = orders.len(), "fetched region orders");

    // ESI's order listing isn't a consistent snapshot: on a large, busy
    // region the book can shift while we're still paging through it, so the
    // same order_id can show up on two different pages. Keep the
    // last-seen copy of each so the upsert never tries to touch the same
    // row twice in one statement (Postgres rejects that under ON CONFLICT
    // DO UPDATE).
    let before_dedup = orders.len();
    let orders: Vec<_> = orders
        .into_iter()
        .map(|order| (order.order_id, order))
        .collect::<HashMap<_, _>>()
        .into_values()
        .collect();
    if orders.len() != before_dedup {
        info!(
            region_id,
            duplicates = before_dedup - orders.len(),
            "deduplicated repeated order_ids across pages"
        );
    }

    let type_ids: HashSet<i32> = orders.iter().map(|order| order.type_id).collect();
    for type_id in type_ids {
        taxonomy::ensure_type(esi, client, type_id).await?;
    }

    db::market::upsert_market_orders(client, &orders, region_id).await?;

    let deleted = db::market::delete_stale_orders(client, region_id, poll_started).await?;
    if deleted > 0 {
        info!(region_id, deleted, "removed stale orders");
    }

    info!(
        region_id,
        order_count = orders.len(),
        deleted,
        elapsed_secs = region_started.elapsed().as_secs_f64(),
        "region orders synced"
    );

    Ok(())
}
