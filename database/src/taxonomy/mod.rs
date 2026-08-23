use std::collections::HashSet;

use anyhow::{Context, Result};
use rfesi::prelude::*;
use tokio_postgres::Client;
use tracing::{debug, info, instrument};

use crate::db;
use crate::progress::log_progress;

/// Syncs categories, groups, market groups, and every type_id referenced
/// anywhere in the market-group tree.
///
/// This deliberately does not walk `get_universe_types` (~40k ids): most of
/// those aren't tradeable. The ones actually needed -- market items, plus
/// station/stargate structure types encountered during universe sync -- are
/// covered by this plus `ensure_type`.
pub async fn sync_all(esi: &Esi, client: &Client) -> Result<()> {
    sync_categories(esi, client).await?;
    sync_groups(esi, client).await?;
    sync_market_groups_and_types(esi, client).await?;
    Ok(())
}

#[instrument(skip_all)]
pub async fn sync_categories(esi: &Esi, client: &Client) -> Result<()> {
    let ids = esi
        .group_universe()
        .get_category_ids()
        .await
        .context("fetching category ids")?;
    let total = ids.len();
    info!(total, "syncing categories");
    for (i, id) in ids.into_iter().enumerate() {
        let category = esi
            .group_universe()
            .get_universe_categories_category(id)
            .await
            .with_context(|| format!("fetching category {id}"))?;
        db::taxonomy::upsert_category(client, &category).await?;
        log_progress(i + 1, total, "categories");
    }
    info!(total, "categories synced");
    Ok(())
}

#[instrument(skip_all)]
pub async fn sync_groups(esi: &Esi, client: &Client) -> Result<()> {
    let mut page = 1;
    let mut total = 0;
    loop {
        let result = esi.group_universe().get_group_ids(Some(page)).await;
        let Some(ids) = crate::esi::next_page(result)
            .with_context(|| format!("fetching group ids page {page}"))?
        else {
            break;
        };
        for id in &ids {
            let group = esi
                .group_universe()
                .get_universe_groups_group(*id)
                .await
                .with_context(|| format!("fetching group {id}"))?;
            db::taxonomy::upsert_group(client, &group).await?;
        }
        total += ids.len();
        info!(page, page_count = ids.len(), running_total = total, "synced group page");
        page += 1;
    }
    info!(total, "groups synced");
    Ok(())
}

#[instrument(skip_all)]
pub async fn sync_market_groups_and_types(esi: &Esi, client: &Client) -> Result<()> {
    let ids = esi
        .group_market()
        .get_market_groups()
        .await
        .context("fetching market group ids")?;
    let total = ids.len();
    info!(total, "syncing market groups");

    let mut market_groups = Vec::with_capacity(total);
    for (i, id) in ids.into_iter().enumerate() {
        let market_group = esi
            .group_market()
            .get_market_group_info(id, None)
            .await
            .with_context(|| format!("fetching market group {id}"))?;
        market_groups.push(market_group);
        log_progress(i + 1, total, "market groups");
    }

    // market_groups.parent_group_id is a self-referencing FK, and ESI's id
    // order doesn't guarantee a parent is listed before its children, so
    // insert in waves: first groups with no parent (or whose parent was
    // inserted in an earlier wave), repeating until every group lands.
    let mut type_ids = HashSet::new();
    let mut inserted = HashSet::new();
    let mut remaining = market_groups;
    while !remaining.is_empty() {
        let (ready, not_ready): (Vec<_>, Vec<_>) = remaining.into_iter().partition(|mg| {
            mg.parent_group_id
                .is_none_or(|parent_id| inserted.contains(&parent_id))
        });
        if ready.is_empty() {
            let stuck: Vec<_> = not_ready.iter().map(|mg| mg.market_group_id).collect();
            anyhow::bail!("market group hierarchy has no valid insertion order for: {stuck:?}");
        }
        for market_group in &ready {
            type_ids.extend(market_group.types.iter().copied());
            db::taxonomy::upsert_market_group(client, market_group).await?;
            inserted.insert(market_group.market_group_id);
        }
        remaining = not_ready;
    }
    info!(total, "market groups synced");

    let total_types = type_ids.len();
    info!(total = total_types, "syncing tradeable types");
    for (i, type_id) in type_ids.into_iter().enumerate() {
        ensure_type(esi, client, type_id).await?;
        log_progress(i + 1, total_types, "tradeable types");
    }
    info!(total = total_types, "tradeable types synced");
    Ok(())
}

/// Fetches and upserts a type if it isn't already stored.
///
/// Used both as a defensive fallback for market order ingestion and,
/// primarily, to backfill structure types (stations, stargates) that fall
/// outside the market-group tree `sync_market_groups_and_types` walks.
pub async fn ensure_type(esi: &Esi, client: &Client, type_id: i32) -> Result<()> {
    if db::taxonomy::type_exists(client, type_id).await? {
        return Ok(());
    }
    let item_type = esi
        .group_universe()
        .get_type(type_id)
        .await
        .with_context(|| format!("fetching type {type_id}"))?;
    debug!(type_id, name = %item_type.name, "backfilled type");
    db::taxonomy::upsert_type(client, &item_type).await
}
