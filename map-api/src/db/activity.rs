use deadpool_postgres::Pool;

use crate::{domain::SystemActivity, error::AppError};

/// Scoped read for annotating a route (or standalone browsing). A
/// `system_id` with no row here is legitimately zero-activity -- the
/// `database` project replaces this table wholesale each poll rather than
/// upserting, so a system simply isn't present once its hourly activity
/// drops to zero.
pub async fn list_activity(
    pool: &Pool,
    system_ids: Option<&[i32]>,
    region_id: Option<i32>,
    constellation_id: Option<i32>,
) -> Result<Vec<SystemActivity>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT a.system_id, a.ship_kills, a.npc_kills, a.pod_kills, a.ship_jumps
             FROM system_activity a
             JOIN solar_systems ss ON ss.system_id = a.system_id
             WHERE ($1::int[] IS NULL OR a.system_id = ANY($1))
               AND ($2::int IS NULL OR ss.region_id = $2)
               AND ($3::int IS NULL OR ss.constellation_id = $3)
             ORDER BY a.system_id",
            &[&system_ids, &region_id, &constellation_id],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| SystemActivity {
            system_id: r.get(0),
            ship_kills: r.get(1),
            npc_kills: r.get(2),
            pod_kills: r.get(3),
            ship_jumps: r.get(4),
        })
        .collect())
}
