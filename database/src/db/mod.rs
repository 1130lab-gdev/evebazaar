pub mod activity;
pub mod market;
pub mod taxonomy;
pub mod universe;

use anyhow::{Context, Result};
use tokio_postgres::{Client, NoTls};
use tracing::error;

/// Connects to Postgres using `DATABASE_URL` (falling back to the
/// docker-compose dev credentials if unset) and spawns the connection's
/// background driver task.
pub async fn connect() -> Result<Client> {
    let conn_str = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://eve:eve@localhost:5532/eve".to_string());

    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .context("connecting to postgres")?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            error!("postgres connection error: {e}");
        }
    });

    Ok(client)
}

/// Applies this project's own schema additions idempotently -- unlike
/// `00-startup.sql` (which only runs against a brand-new volume via
/// docker-entrypoint-initdb.d), this runs every startup so an
/// already-provisioned `eve-db` picks up new tables too. Mirrors the
/// self-bootstrapping pattern `tgi`/`catalog-api` already use for their own
/// schema additions.
pub async fn bootstrap_schema(client: &Client) -> Result<()> {
    client
        .batch_execute(
            "
            CREATE TABLE IF NOT EXISTS system_activity (
                system_id  INTEGER PRIMARY KEY REFERENCES solar_systems (system_id),
                ship_kills INTEGER NOT NULL DEFAULT 0,
                npc_kills  INTEGER NOT NULL DEFAULT 0,
                pod_kills  INTEGER NOT NULL DEFAULT 0,
                ship_jumps INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            ",
        )
        .await
        .context("bootstrapping system_activity table")?;
    Ok(())
}
