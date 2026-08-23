mod activity;
mod db;
mod esi;
mod market;
mod progress;
mod taxonomy;
mod universe;

use std::time::{Duration, Instant};

use rfesi::prelude::*;
use tracing::info;
use tracing_subscriber::EnvFilter;

use clap::Parser;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    #[arg(short, long)]
    mode: String,

    /// Seconds to wait between polls in `mktdata` mode.
    #[arg(long, env = "MKTDATA_INTERVAL_SECS", default_value_t = 300)]
    interval_secs: u64,

    /// Seconds to wait between kill/jump activity polls in `mktdata` mode.
    /// Coarser than `interval_secs` by default -- ESI itself only refreshes
    /// these endpoints roughly hourly, so polling faster just re-fetches
    /// the same cached snapshot.
    #[arg(long, env = "ACTIVITY_INTERVAL_SECS", default_value_t = 3600)]
    activity_interval_secs: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let mut esi = EsiBuilder::new()
        .user_agent("database project (contact: mmccabe1993@gmail.com)")
        .build()?;

    // rfesi resolves each endpoint's URL by looking up its operation ID in
    // ESI's spec, so that spec has to be fetched once before making calls.
    info!("fetching ESI spec");
    esi.update_spec().await?;

    let client = db::connect().await?;
    info!("connected to database");
    db::bootstrap_schema(&client).await?;

    let run_started = Instant::now();

    if args.mode == "mktdata" {
        // Activity gets its own connection rather than sharing `client`:
        // its replace is transactional (needs `&mut Client`), while the
        // market loop only ever does plain non-transactional statements on
        // `client` -- running both concurrently under one shared client
        // would need a mutable and an immutable borrow alive at once.
        let mut activity_client = db::connect().await?;
        tokio::try_join!(
            market_sync_loop(&esi, &client, Duration::from_secs(args.interval_secs)),
            activity_sync_loop(&esi, &mut activity_client, Duration::from_secs(args.activity_interval_secs)),
        )?;
    } else {
        taxonomy_sync(&esi, &client).await?;
        universe_sync(&esi, &client).await?;
        market_sync(&esi, &client).await?;
        let mut activity_client = client;
        activity::sync_all(&esi, &mut activity_client).await?;
        info!(
            elapsed_secs = run_started.elapsed().as_secs_f64(),
            "sync run complete"
        );
    }

    Ok(())
}

async fn taxonomy_sync(esi: &Esi, client: &tokio_postgres::Client) -> anyhow::Result<()> {
    info!("== taxonomy sync starting ==");
    let phase_started = Instant::now();
    taxonomy::sync_all(&esi, &client).await?;
    info!(
        elapsed_secs = phase_started.elapsed().as_secs_f64(),
        "== taxonomy sync complete =="
    );
    Ok(())
}

async fn universe_sync(esi: &Esi, client: &tokio_postgres::Client) -> anyhow::Result<()> {
    info!("== universe sync starting ==");
    let phase_started = Instant::now();
    universe::sync_all(&esi, &client).await?;
    info!(
        elapsed_secs = phase_started.elapsed().as_secs_f64(),
        "== universe sync complete =="
    );
    Ok(())
}

/// Repeatedly polls market orders on `interval` until interrupted (Ctrl-C).
///
/// Each poll is a full `market_sync` pass, which already upserts only
/// what's new/changed and deletes orders that dropped out of the order
/// book -- so periodic calls here are what makes the on-disk data track
/// ESI's live state over time.
async fn market_sync_loop(
    esi: &Esi,
    client: &tokio_postgres::Client,
    interval: Duration,
) -> anyhow::Result<()> {
    info!(interval_secs = interval.as_secs(), "starting periodic market sync");
    loop {
        market_sync(esi, client).await?;
        info!(interval_secs = interval.as_secs(), "sleeping until next market sync");
        tokio::select! {
            _ = tokio::time::sleep(interval) => {}
            _ = tokio::signal::ctrl_c() => {
                info!("received shutdown signal, stopping market sync loop");
                break;
            }
        }
    }
    Ok(())
}

async fn market_sync(esi: &Esi, client: &tokio_postgres::Client) -> anyhow::Result<()> {
    info!("== market sync starting ==");
    let phase_started = Instant::now();
    market::sync_all(&esi, &client).await?;
    info!(
        elapsed_secs = phase_started.elapsed().as_secs_f64(),
        "== market sync complete =="
    );
    Ok(())
}

/// Repeatedly polls kill/jump activity on `interval` until interrupted
/// (Ctrl-C). Runs on its own connection and its own (much coarser)
/// interval from the market loop -- see the note where this is spawned in
/// `main` for why it isn't sharing `market_sync_loop`'s connection.
async fn activity_sync_loop(
    esi: &Esi,
    client: &mut tokio_postgres::Client,
    interval: Duration,
) -> anyhow::Result<()> {
    info!(interval_secs = interval.as_secs(), "starting periodic activity sync");
    loop {
        info!("== activity sync starting ==");
        let phase_started = Instant::now();
        activity::sync_all(esi, client).await?;
        info!(
            elapsed_secs = phase_started.elapsed().as_secs_f64(),
            "== activity sync complete =="
        );
        info!(interval_secs = interval.as_secs(), "sleeping until next activity sync");
        tokio::select! {
            _ = tokio::time::sleep(interval) => {}
            _ = tokio::signal::ctrl_c() => {
                info!("received shutdown signal, stopping activity sync loop");
                break;
            }
        }
    }
    Ok(())
}
