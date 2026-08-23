mod db;
mod index;

use std::time::Duration;

use anyhow::Result;
use clap::Parser;
use tokio_postgres::Client;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// `loop` runs forever, recomputing the index every `interval_secs`.
    /// Any other value computes it once and exits.
    #[arg(short, long)]
    mode: String,

    /// Seconds to wait between computations in `loop` mode. TGI is a
    /// slow-moving economic indicator, not a tick-by-tick feed, so this
    /// defaults much coarser than database's market-order poll interval.
    #[arg(long, env = "TGI_INTERVAL_SECS", default_value_t = 3600)]
    interval_secs: u64,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let mut client = db::connect().await?;
    db::bootstrap_schema(&client).await?;

    if args.mode == "loop" {
        index_loop(&mut client, Duration::from_secs(args.interval_secs)).await?;
    } else {
        run_once(&mut client).await?;
    }

    Ok(())
}

/// Runs `run_once` on `interval` until interrupted, mirroring
/// `database::market_sync_loop`: a failed computation propagates and ends
/// the process rather than being silently swallowed, since this codebase
/// treats a failed periodic job as fatal for that process elsewhere too.
async fn index_loop(client: &mut Client, interval: Duration) -> Result<()> {
    info!(interval_secs = interval.as_secs(), "starting periodic TGI computation");
    loop {
        run_once(client).await?;
        info!(interval_secs = interval.as_secs(), "sleeping until next TGI computation");
        tokio::select! {
            _ = tokio::time::sleep(interval) => {}
            _ = tokio::signal::ctrl_c() => {
                info!("received shutdown signal, stopping TGI loop");
                break;
            }
        }
    }
    Ok(())
}

/// One full index computation: builds the current basket, snapshots it,
/// and -- if a prior base-period run exists -- computes and persists the
/// Laspeyres/Paasche/Fisher values against it.
async fn run_once(client: &mut Client) -> Result<()> {
    let type_ids = db::tradeable_goods_type_ids(client).await?;
    info!(item_count = type_ids.len(), "loaded Tradeable Goods Index basket definition");

    let samples = db::market_samples(client, &type_ids).await?;
    info!(sample_count = samples.len(), "loaded qualifying market samples (>=2 bids, >=2 offers)");

    let current_basket = index::build_basket(&samples);
    info!(item_count = current_basket.len(), "built current basket after 1-stddev filtering");

    let run_id = db::insert_run(client, &current_basket).await?;
    info!(run_id, "persisted basket snapshot");

    let Some(base_run_id) = db::earliest_other_run(client, run_id).await? else {
        info!(run_id, "first run recorded; no prior snapshot exists yet, so there's no index value to compute");
        return Ok(());
    };

    let base_basket = db::run_snapshot(client, base_run_id).await?;

    let mut current_goods = Vec::new();
    let mut base_goods = Vec::new();
    for (type_id, current_item) in &current_basket {
        if let Some(base_item) = base_basket.get(type_id) {
            current_goods.push(*current_item);
            base_goods.push(*base_item);
        }
    }

    if current_goods.is_empty() {
        warn!(run_id, base_run_id, "no items overlap between the current and base baskets; cannot compute an index");
        return Ok(());
    }

    let lpi = index::calc_laspeyres_index(&current_goods, &base_goods);
    let ppi = index::calc_paasche_index(&current_goods, &base_goods);
    let fpi = (lpi * ppi).sqrt();

    db::record_index_values(client, run_id, lpi, ppi, fpi).await?;

    info!(
        run_id,
        base_run_id,
        item_count = current_goods.len(),
        laspeyres = lpi,
        paasche = ppi,
        fisher = fpi,
        "Tradeable Goods Index computed"
    );

    Ok(())
}
