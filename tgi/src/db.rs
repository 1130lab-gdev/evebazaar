use std::collections::HashMap;

use anyhow::{Context, Result};
use tokio_postgres::{Client, NoTls};

use crate::index::Item;

/// Market groups 20 ("Industrial Goods") and 492 ("Consumer Products") are
/// the two children of market group 19 ("Trade Goods") -- together they
/// define the Tradeable Goods Index basket.
const INDUSTRIAL_GOODS_MARKET_GROUP: i32 = 20;
const CONSUMER_PRODUCTS_MARKET_GROUP: i32 = 492;

/// Connects to the shared `eve` Postgres instance the `database` project
/// maintains from ESI (same default as that project's own `db::connect`).
pub async fn connect() -> Result<Client> {
    let conn_str = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://eve:eve@localhost:5532/eve".to_string());

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .context("connecting to postgres")?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::error!("postgres connection error: {e}");
        }
    });

    Ok(client)
}

/// Applies tgi's own schema idempotently against the shared `eve` database,
/// mirroring how `risk` owns a separate schema in the `exchange` database
/// it doesn't otherwise control. `index_runs` records one row per
/// computation, including the computed index values themselves (NULL until
/// a base period exists to compare against -- see `record_index_values`);
/// `item_snapshots` records each item's basket contribution for that run,
/// so later runs can pick an earlier run as their base period.
pub async fn bootstrap_schema(client: &Client) -> Result<()> {
    client
        .batch_execute(
            "
            CREATE SCHEMA IF NOT EXISTS tgi;

            CREATE TABLE IF NOT EXISTS tgi.index_runs (
                id          BIGSERIAL PRIMARY KEY,
                computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                laspeyres   DOUBLE PRECISION,
                paasche     DOUBLE PRECISION,
                fisher      DOUBLE PRECISION
            );
            -- Migration for installs from before the index values were persisted:
            ALTER TABLE tgi.index_runs ADD COLUMN IF NOT EXISTS laspeyres DOUBLE PRECISION;
            ALTER TABLE tgi.index_runs ADD COLUMN IF NOT EXISTS paasche DOUBLE PRECISION;
            ALTER TABLE tgi.index_runs ADD COLUMN IF NOT EXISTS fisher DOUBLE PRECISION;

            CREATE TABLE IF NOT EXISTS tgi.item_snapshots (
                run_id  BIGINT NOT NULL REFERENCES tgi.index_runs (id),
                type_id INTEGER NOT NULL,
                price   DOUBLE PRECISION NOT NULL,
                qty     BIGINT NOT NULL,
                PRIMARY KEY (run_id, type_id)
            );
            ",
        )
        .await
        .context("bootstrapping tgi schema")?;
    Ok(())
}

/// type_ids of every published item in the Tradeable Goods basket.
pub async fn tradeable_goods_type_ids(client: &Client) -> Result<Vec<i32>> {
    let market_groups = [INDUSTRIAL_GOODS_MARKET_GROUP, CONSUMER_PRODUCTS_MARKET_GROUP];
    let rows = client
        .query(
            "SELECT type_id FROM types WHERE market_group_id = ANY($1) AND published",
            &[&market_groups.as_slice()],
        )
        .await
        .context("fetching tradeable goods type ids")?;
    Ok(rows.into_iter().map(|row| row.get(0)).collect())
}

/// One (item, region) market observation: the best-bid/best-offer midpoint
/// and summed quantity for a type in a region that has at least two live
/// bids and two live offers.
pub struct MarketSample {
    pub type_id: i32,
    pub region_id: i32,
    pub price: f64,
    pub qty: i64,
}

pub async fn market_samples(client: &Client, type_ids: &[i32]) -> Result<Vec<MarketSample>> {
    let rows = client
        .query(
            "WITH counts AS (
                SELECT type_id, region_id,
                    COUNT(*) FILTER (WHERE is_buy_order)      AS bid_count,
                    COUNT(*) FILTER (WHERE NOT is_buy_order)  AS offer_count
                FROM market_orders
                WHERE type_id = ANY($1)
                GROUP BY type_id, region_id
                HAVING COUNT(*) FILTER (WHERE is_buy_order) >= 2
                   AND COUNT(*) FILTER (WHERE NOT is_buy_order) >= 2
             ),
             best_bids AS (
                SELECT DISTINCT ON (type_id, region_id)
                    type_id, region_id, price AS bid_price, volume_remain AS bid_qty
                FROM market_orders
                WHERE is_buy_order AND type_id = ANY($1)
                ORDER BY type_id, region_id, price DESC
             ),
             best_offers AS (
                SELECT DISTINCT ON (type_id, region_id)
                    type_id, region_id, price AS offer_price, volume_remain AS offer_qty
                FROM market_orders
                WHERE NOT is_buy_order AND type_id = ANY($1)
                ORDER BY type_id, region_id, price ASC
             )
             SELECT c.type_id, c.region_id,
                    (bb.bid_price + bo.offer_price) / 2.0 AS price,
                    (bb.bid_qty::bigint + bo.offer_qty::bigint) AS qty
             FROM counts c
             JOIN best_bids bb ON bb.type_id = c.type_id AND bb.region_id = c.region_id
             JOIN best_offers bo ON bo.type_id = c.type_id AND bo.region_id = c.region_id",
            &[&type_ids],
        )
        .await
        .context("fetching market samples")?;

    Ok(rows
        .into_iter()
        .map(|row| MarketSample {
            type_id: row.get(0),
            region_id: row.get(1),
            price: row.get(2),
            qty: row.get(3),
        })
        .collect())
}

/// Persists this run's basket and returns the new run's id.
pub async fn insert_run(client: &mut Client, basket: &HashMap<i32, Item>) -> Result<i64> {
    let transaction = client.transaction().await.context("starting snapshot transaction")?;

    let row = transaction
        .query_one("INSERT INTO tgi.index_runs DEFAULT VALUES RETURNING id", &[])
        .await
        .context("inserting index run")?;
    let run_id: i64 = row.get(0);

    let mut type_ids = Vec::with_capacity(basket.len());
    let mut prices = Vec::with_capacity(basket.len());
    let mut qtys = Vec::with_capacity(basket.len());
    for (type_id, item) in basket {
        type_ids.push(*type_id);
        prices.push(item.price);
        qtys.push(item.qty);
    }

    transaction
        .execute(
            "INSERT INTO tgi.item_snapshots (run_id, type_id, price, qty)
             SELECT $1, t.type_id, t.price, t.qty
             FROM UNNEST($2::int[], $3::double precision[], $4::bigint[]) AS t(type_id, price, qty)",
            &[&run_id, &type_ids, &prices, &qtys],
        )
        .await
        .context("inserting item snapshots")?;

    transaction.commit().await.context("committing snapshot transaction")?;
    Ok(run_id)
}

/// The earliest run other than `current_run_id` -- tgi's base period is
/// fixed at the first run ever recorded, the way a CPI base year is fixed
/// rather than rolling.
pub async fn earliest_other_run(client: &Client, current_run_id: i64) -> Result<Option<i64>> {
    let row = client
        .query_opt(
            "SELECT id FROM tgi.index_runs WHERE id != $1 ORDER BY id ASC LIMIT 1",
            &[&current_run_id],
        )
        .await
        .context("fetching earliest run")?;
    Ok(row.map(|row| row.get(0)))
}

pub async fn run_snapshot(client: &Client, run_id: i64) -> Result<HashMap<i32, Item>> {
    let rows = client
        .query("SELECT type_id, price, qty FROM tgi.item_snapshots WHERE run_id = $1", &[&run_id])
        .await
        .context("fetching run snapshot")?;
    Ok(rows
        .into_iter()
        .map(|row| (row.get(0), Item { price: row.get(1), qty: row.get(2) }))
        .collect())
}

/// Records `run_id`'s computed index values once a base period exists to
/// compare against (see `main::run_once` -- a run with no overlapping base
/// basket never calls this, leaving the columns NULL). This is what makes
/// the Fisher index queryable as a live price by consumers like `risk`
/// (see `risk::price::latest_tgi_value`), instead of only ever reaching a
/// human via stdout.
pub async fn record_index_values(client: &Client, run_id: i64, laspeyres: f64, paasche: f64, fisher: f64) -> Result<()> {
    client
        .execute(
            "UPDATE tgi.index_runs SET laspeyres = $1, paasche = $2, fisher = $3 WHERE id = $4",
            &[&laspeyres, &paasche, &fisher, &run_id],
        )
        .await
        .context("recording computed index values")?;
    Ok(())
}
