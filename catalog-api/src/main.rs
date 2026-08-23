mod auth;
mod config;
mod db;
mod domain;
mod error;
mod routes;
mod state;

use clap::Parser;
use tracing_subscriber::EnvFilter;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config = Config::parse();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .init();

    let pool = db::build_pool(&config.database_url)?;
    tracing::info!("connected to database");

    let exchange_pool = db::build_pool(&config.exchange_database_url)?;
    tracing::info!("connected to exchange database (read-only, for auth)");

    db::bootstrap::run(&pool).await?;
    tracing::info!("search index bootstrapped");

    let state = AppState::new(pool, exchange_pool);
    let app = routes::build_router(state);

    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    tracing::info!(addr = %config.listen_addr, "listening");

    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;

    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
