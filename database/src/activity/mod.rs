use anyhow::{Context, Result};
use rfesi::prelude::*;
use tokio_postgres::Client;
use tracing::{info, instrument};

use crate::db;

/// Pulls this hour's universe-wide kill/jump snapshot -- both calls are a
/// single request covering every system in the game, no pagination, no
/// per-system round trips.
#[instrument(skip_all)]
pub async fn sync_all(esi: &Esi, client: &mut Client) -> Result<()> {
    let kills = esi.group_universe().get_system_kills().await.context("fetching system kills")?;
    let jumps = esi.group_universe().get_system_jumps().await.context("fetching system jumps")?;
    info!(kill_rows = kills.len(), jump_rows = jumps.len(), "fetched activity snapshot");

    db::activity::replace_system_activity(client, &kills, &jumps).await?;

    Ok(())
}
