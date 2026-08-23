use deadpool_postgres::Pool;

use crate::{
    domain::{Constellation, Region, SystemSummary},
    error::AppError,
};

pub async fn list_regions(pool: &Pool) -> Result<Vec<Region>, AppError> {
    let client = pool.get().await?;
    // NULLIF collapses empty-string rows down to NULL alongside the
    // genuinely-unset ones, so callers only ever see "a real description"
    // or "none" -- not a third empty-string case to also check for.
    let rows = client
        .query("SELECT region_id, name, NULLIF(description, '') FROM regions ORDER BY name", &[])
        .await?;
    Ok(rows.into_iter().map(|r| Region { region_id: r.get(0), name: r.get(1), description: r.get(2) }).collect())
}

pub async fn list_constellations(pool: &Pool, region_id: Option<i32>) -> Result<Vec<Constellation>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT constellation_id, region_id, name FROM constellations
             WHERE $1::int IS NULL OR region_id = $1
             ORDER BY name",
            &[&region_id],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| Constellation { constellation_id: r.get(0), region_id: r.get(1), name: r.get(2) })
        .collect())
}

fn row_to_system(r: &tokio_postgres::Row) -> SystemSummary {
    SystemSummary {
        system_id: r.get(0),
        constellation_id: r.get(1),
        region_id: r.get(2),
        name: r.get(3),
        security_status: r.get(4),
        position_x: r.get(5),
        position_y: r.get(6),
        position_z: r.get(7),
    }
}

pub async fn list_systems(
    pool: &Pool,
    region_id: Option<i32>,
    constellation_id: Option<i32>,
) -> Result<Vec<SystemSummary>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT system_id, constellation_id, region_id, name, security_status,
                    position_x, position_y, position_z
             FROM solar_systems
             WHERE ($1::int IS NULL OR region_id = $1)
               AND ($2::int IS NULL OR constellation_id = $2)
             ORDER BY name",
            &[&region_id, &constellation_id],
        )
        .await?;
    Ok(rows.iter().map(row_to_system).collect())
}

pub async fn get_system(pool: &Pool, system_id: i32) -> Result<Option<SystemSummary>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "SELECT system_id, constellation_id, region_id, name, security_status,
                    position_x, position_y, position_z
             FROM solar_systems
             WHERE system_id = $1",
            &[&system_id],
        )
        .await?;
    Ok(row.as_ref().map(row_to_system))
}
