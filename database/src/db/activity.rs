use std::collections::HashMap;

use anyhow::{Context, Result};
use rfesi::groups::{SystemJumps, SystemKills};
use tokio_postgres::Client;

/// Replaces the entire table with this poll's snapshot. Unlike
/// `market.rs`'s upsert-plus-delete-stale (which has to tolerate a
/// multi-page, possibly-inconsistent crawl), both ESI calls behind this are
/// single-request, whole-universe snapshots -- a system simply isn't in the
/// response once its hourly activity drops to zero, so a full replace is
/// both simpler and correct at this table's size (at most one row per
/// system in the game).
pub async fn replace_system_activity(client: &mut Client, kills: &[SystemKills], jumps: &[SystemJumps]) -> Result<()> {
    let mut by_system: HashMap<i32, (i32, i32, i32, i32)> = HashMap::new();
    for k in kills {
        let entry = by_system.entry(k.system_id).or_default();
        entry.0 = k.ship_kills;
        entry.1 = k.npc_kills;
        entry.2 = k.pod_kills;
    }
    for j in jumps {
        by_system.entry(j.system_id).or_default().3 = j.ship_jumps;
    }

    let mut system_ids = Vec::with_capacity(by_system.len());
    let mut ship_kills = Vec::with_capacity(by_system.len());
    let mut npc_kills = Vec::with_capacity(by_system.len());
    let mut pod_kills = Vec::with_capacity(by_system.len());
    let mut ship_jumps = Vec::with_capacity(by_system.len());
    for (system_id, (sk, nk, pk, sj)) in by_system {
        system_ids.push(system_id);
        ship_kills.push(sk);
        npc_kills.push(nk);
        pod_kills.push(pk);
        ship_jumps.push(sj);
    }

    let transaction = client.transaction().await.context("starting activity replace transaction")?;
    transaction.execute("DELETE FROM system_activity", &[]).await.context("clearing system_activity")?;
    transaction
        .execute(
            "INSERT INTO system_activity (system_id, ship_kills, npc_kills, pod_kills, ship_jumps, updated_at)
             SELECT system_id, ship_kills, npc_kills, pod_kills, ship_jumps, now()
             FROM UNNEST($1::int[], $2::int[], $3::int[], $4::int[], $5::int[])
                AS t(system_id, ship_kills, npc_kills, pod_kills, ship_jumps)",
            &[&system_ids, &ship_kills, &npc_kills, &pod_kills, &ship_jumps],
        )
        .await
        .context("inserting system_activity rows")?;
    transaction.commit().await.context("committing activity replace transaction")?;

    Ok(())
}
