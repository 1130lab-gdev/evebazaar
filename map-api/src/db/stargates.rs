use deadpool_postgres::Pool;

use crate::{domain::{Stargate, StargateDistance}, error::AppError};

/// Meters per Julian light-year (365.25 days at c). The constant every
/// third-party EVE map tool uses to turn ESI's raw meter-scale galactic
/// positions into the light-year distances players actually reason about.
const METERS_PER_LY: f64 = 9_460_730_472_580_800.0;

pub async fn list_stargates(
    pool: &Pool,
    region_id: Option<i32>,
    constellation_id: Option<i32>,
    system_id: Option<i32>,
) -> Result<Vec<Stargate>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT sg.stargate_id, sg.system_id, ss1.name, ss1.region_id,
                    sg.destination_stargate_id, sg.destination_system_id, ss2.name, ss2.region_id,
                    sqrt(pow(ss1.position_x - ss2.position_x, 2)
                       + pow(ss1.position_y - ss2.position_y, 2)
                       + pow(ss1.position_z - ss2.position_z, 2)) / $4 AS jump_distance_ly
             FROM stargates sg
             JOIN solar_systems ss1 ON ss1.system_id = sg.system_id
             JOIN solar_systems ss2 ON ss2.system_id = sg.destination_system_id
             WHERE ($1::int IS NULL OR ss1.region_id = $1)
               AND ($2::int IS NULL OR ss1.constellation_id = $2)
               AND ($3::int IS NULL OR sg.system_id = $3)
             ORDER BY ss1.name, sg.stargate_id",
            &[&region_id, &constellation_id, &system_id, &METERS_PER_LY],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| Stargate {
            stargate_id: r.get(0),
            system_id: r.get(1),
            system_name: r.get(2),
            region_id: r.get(3),
            destination_stargate_id: r.get(4),
            destination_system_id: r.get(5),
            destination_system_name: r.get(6),
            destination_region_id: r.get(7),
            jump_distance_ly: r.get(8),
        })
        .collect())
}

pub async fn pairwise_distances(pool: &Pool, system_id: i32) -> Result<Vec<StargateDistance>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT sg1.stargate_id, sg2.stargate_id,
                    sqrt(pow(sg1.position_x - sg2.position_x, 2)
                       + pow(sg1.position_y - sg2.position_y, 2)
                       + pow(sg1.position_z - sg2.position_z, 2)) AS distance_m
             FROM stargates sg1
             JOIN stargates sg2 ON sg2.system_id = sg1.system_id AND sg2.stargate_id > sg1.stargate_id
             WHERE sg1.system_id = $1
             ORDER BY sg1.stargate_id, sg2.stargate_id",
            &[&system_id],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| StargateDistance { stargate_id_a: r.get(0), stargate_id_b: r.get(1), distance_m: r.get(2) })
        .collect())
}
