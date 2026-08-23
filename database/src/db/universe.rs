use anyhow::Result;
use rfesi::groups::{Constellation, Region, Stargate, Station, System};
use tokio_postgres::Client;

pub async fn region_ids(client: &Client) -> Result<Vec<i32>> {
    let rows = client
        .query("SELECT region_id FROM regions ORDER BY region_id", &[])
        .await?;
    Ok(rows.iter().map(|row| row.get(0)).collect())
}

pub async fn upsert_region(client: &Client, region: &Region) -> Result<()> {
    client
        .execute(
            "INSERT INTO regions (region_id, name, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (region_id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description",
            &[&region.region_id, &region.name, &region.description],
        )
        .await?;
    Ok(())
}

pub async fn upsert_constellation(client: &Client, constellation: &Constellation) -> Result<()> {
    client
        .execute(
            "INSERT INTO constellations
                (constellation_id, region_id, name, position_x, position_y, position_z)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (constellation_id) DO UPDATE SET
                region_id = EXCLUDED.region_id,
                name = EXCLUDED.name,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z",
            &[
                &constellation.constellation_id,
                &constellation.region_id,
                &constellation.name,
                &constellation.position.x,
                &constellation.position.y,
                &constellation.position.z,
            ],
        )
        .await?;
    Ok(())
}

/// `region_id` is denormalized onto `solar_systems` for query convenience,
/// but ESI's `System` struct doesn't carry it -- the caller passes along the
/// region_id of the constellation the system was reached through.
pub async fn upsert_solar_system(client: &Client, system: &System, region_id: i32) -> Result<()> {
    client
        .execute(
            "INSERT INTO solar_systems
                (system_id, constellation_id, region_id, name, security_status,
                 security_class, star_id, position_x, position_y, position_z)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (system_id) DO UPDATE SET
                constellation_id = EXCLUDED.constellation_id,
                region_id = EXCLUDED.region_id,
                name = EXCLUDED.name,
                security_status = EXCLUDED.security_status,
                security_class = EXCLUDED.security_class,
                star_id = EXCLUDED.star_id,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z",
            &[
                &system.system_id,
                &system.constellation_id,
                &region_id,
                &system.name,
                &system.security_status,
                &system.security_class,
                &system.star_id,
                &system.position.x,
                &system.position.y,
                &system.position.z,
            ],
        )
        .await?;
    Ok(())
}

pub async fn upsert_stargate(client: &Client, stargate: &Stargate) -> Result<()> {
    client
        .execute(
            "INSERT INTO stargates
                (stargate_id, system_id, type_id, name, destination_stargate_id,
                 destination_system_id, position_x, position_y, position_z)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (stargate_id) DO UPDATE SET
                system_id = EXCLUDED.system_id,
                type_id = EXCLUDED.type_id,
                name = EXCLUDED.name,
                destination_stargate_id = EXCLUDED.destination_stargate_id,
                destination_system_id = EXCLUDED.destination_system_id,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z",
            &[
                &stargate.stargate_id,
                &stargate.system_id,
                &stargate.type_id,
                &stargate.name,
                &stargate.destination.stargate_id,
                &stargate.destination.system_id,
                &stargate.position.x,
                &stargate.position.y,
                &stargate.position.z,
            ],
        )
        .await?;
    Ok(())
}

pub async fn upsert_station(client: &Client, station: &Station) -> Result<()> {
    client
        .execute(
            "INSERT INTO stations
                (station_id, system_id, type_id, name, owner_id, race_id,
                 reprocessing_efficiency, reprocessing_stations_take,
                 max_dockable_ship_volume, office_rental_cost, services,
                 position_x, position_y, position_z)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (station_id) DO UPDATE SET
                system_id = EXCLUDED.system_id,
                type_id = EXCLUDED.type_id,
                name = EXCLUDED.name,
                owner_id = EXCLUDED.owner_id,
                race_id = EXCLUDED.race_id,
                reprocessing_efficiency = EXCLUDED.reprocessing_efficiency,
                reprocessing_stations_take = EXCLUDED.reprocessing_stations_take,
                max_dockable_ship_volume = EXCLUDED.max_dockable_ship_volume,
                office_rental_cost = EXCLUDED.office_rental_cost,
                services = EXCLUDED.services,
                position_x = EXCLUDED.position_x,
                position_y = EXCLUDED.position_y,
                position_z = EXCLUDED.position_z",
            &[
                &station.station_id,
                &station.system_id,
                &station.type_id,
                &station.name,
                &station.owner,
                &station.race_id,
                &station.reprocessing_efficiency,
                &station.reprocessing_stations_take,
                &station.max_dockable_ship_volume,
                &station.office_rental_cost,
                &station.services,
                &station.position.x,
                &station.position.y,
                &station.position.z,
            ],
        )
        .await?;
    Ok(())
}
