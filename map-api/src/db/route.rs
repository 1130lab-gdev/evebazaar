use std::collections::HashMap;

use deadpool_postgres::Pool;

use crate::{domain::Station, error::AppError};

/// `system_id -> (name, constellation_id, region_id, region_name, security_status)`,
/// scoped to exactly the systems a computed route passed through -- small
/// and explicit rather than reusing the general `taxonomy::list_systems`
/// filters, since this also needs `region_name` (not on `SystemSummary`)
/// and a handful of specific ids rather than a region/constellation scope.
pub async fn system_info(pool: &Pool, system_ids: &[i32]) -> Result<HashMap<i32, (String, i32, i32, String, f64)>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT ss.system_id, ss.name, ss.constellation_id, ss.region_id, r.name, ss.security_status
             FROM solar_systems ss
             JOIN regions r ON r.region_id = ss.region_id
             WHERE ss.system_id = ANY($1)",
            &[&system_ids],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let system_id: i32 = r.get(0);
            (system_id, (r.get(1), r.get(2), r.get(3), r.get(4), r.get(5)))
        })
        .collect())
}

pub async fn stations_by_system(pool: &Pool, system_ids: &[i32]) -> Result<HashMap<i32, Vec<Station>>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT system_id, station_id, name FROM stations WHERE system_id = ANY($1) ORDER BY name",
            &[&system_ids],
        )
        .await?;
    let mut by_system: HashMap<i32, Vec<Station>> = HashMap::new();
    for r in rows {
        let system_id: i32 = r.get(0);
        by_system.entry(system_id).or_default().push(Station { station_id: r.get(1), name: r.get(2) });
    }
    Ok(by_system)
}
