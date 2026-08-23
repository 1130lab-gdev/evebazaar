use anyhow::{Context, Result};
use rfesi::groups::{Constellation, Region, System};
use rfesi::prelude::*;
use tokio_postgres::Client;
use tracing::{debug, info, instrument};

use crate::progress::log_progress;
use crate::{db, taxonomy};

/// Walks the full universe hierarchy: regions -> constellations ->
/// solar systems, then -- in a second pass, once every system exists --
/// stargates/stations. Each level's ids come from the parent level's ESI
/// response (e.g. `region.constellations`), so this is a straight top-down
/// crawl -- no separate id-listing call needed below the region level.
///
/// Stargates/stations are deliberately not synced inline with their system:
/// a stargate's `destination_system_id` FK very often points at a system in
/// a different, not-yet-walked region (interregional gates are common), so
/// inserting it mid-walk would violate the FK. Splitting into two passes
/// guarantees every solar system is already in the database before any
/// stargate or station references one.
#[instrument(skip_all)]
pub async fn sync_all(esi: &Esi, client: &Client) -> Result<()> {
    let regions = sync_regions(esi, client).await?;
    let total_regions = regions.len();
    let mut all_systems = Vec::new();
    for (i, region) in regions.iter().enumerate() {
        info!(
            region_id = region.region_id,
            name = %region.name,
            progress = i + 1,
            total = total_regions,
            "walking region"
        );
        let constellations = sync_constellations(esi, client, region).await?;
        let total_constellations = constellations.len();
        for (j, constellation) in constellations.iter().enumerate() {
            debug!(
                constellation_id = constellation.constellation_id,
                progress = j + 1,
                total = total_constellations,
                "walking constellation"
            );
            let systems = sync_solar_systems(esi, client, constellation).await?;
            all_systems.extend(systems);
        }
    }

    let total_systems = all_systems.len();
    info!(total = total_systems, "syncing stargates and stations");
    for (i, system) in all_systems.iter().enumerate() {
        sync_stargates(esi, client, system).await?;
        sync_stations(esi, client, system).await?;
        log_progress(i + 1, total_systems, "stargates/stations");
    }
    info!(total = total_systems, "stargates and stations synced");
    Ok(())
}

#[instrument(skip_all)]
pub async fn sync_regions(esi: &Esi, client: &Client) -> Result<Vec<Region>> {
    let ids = esi
        .group_universe()
        .get_region_ids()
        .await
        .context("fetching region ids")?;
    info!(total = ids.len(), "syncing regions");
    let mut regions = Vec::with_capacity(ids.len());
    for id in ids {
        let region = esi
            .group_universe()
            .get_region(id)
            .await
            .with_context(|| format!("fetching region {id}"))?;
        db::universe::upsert_region(client, &region).await?;
        regions.push(region);
    }
    Ok(regions)
}

#[instrument(skip_all, fields(region_id = region.region_id))]
pub async fn sync_constellations(
    esi: &Esi,
    client: &Client,
    region: &Region,
) -> Result<Vec<Constellation>> {
    let mut constellations = Vec::with_capacity(region.constellations.len());
    for id in &region.constellations {
        let constellation = esi
            .group_universe()
            .get_constellation(*id)
            .await
            .with_context(|| format!("fetching constellation {id}"))?;
        db::universe::upsert_constellation(client, &constellation).await?;
        constellations.push(constellation);
    }
    Ok(constellations)
}

#[instrument(skip_all, fields(constellation_id = constellation.constellation_id))]
pub async fn sync_solar_systems(
    esi: &Esi,
    client: &Client,
    constellation: &Constellation,
) -> Result<Vec<System>> {
    let mut systems = Vec::with_capacity(constellation.systems.len());
    for id in &constellation.systems {
        let system = esi
            .group_universe()
            .get_system(*id)
            .await
            .with_context(|| format!("fetching system {id}"))?;
        db::universe::upsert_solar_system(client, &system, constellation.region_id).await?;
        systems.push(system);
    }
    Ok(systems)
}

#[instrument(skip_all, fields(system_id = system.system_id))]
pub async fn sync_stargates(esi: &Esi, client: &Client, system: &System) -> Result<()> {
    let Some(stargate_ids) = &system.stargates else {
        return Ok(());
    };
    for id in stargate_ids {
        let stargate = esi
            .group_universe()
            .get_stargate(*id)
            .await
            .with_context(|| format!("fetching stargate {id}"))?;
        // Stargate structure types (e.g. "Stargate (Jita)") live outside the
        // market-group tree taxonomy::sync_all walks, so backfill on demand.
        taxonomy::ensure_type(esi, client, stargate.type_id).await?;
        db::universe::upsert_stargate(client, &stargate).await?;
        debug!(stargate_id = id, "synced stargate");
    }
    Ok(())
}

#[instrument(skip_all, fields(system_id = system.system_id))]
pub async fn sync_stations(esi: &Esi, client: &Client, system: &System) -> Result<()> {
    let Some(station_ids) = &system.stations else {
        return Ok(());
    };
    for id in station_ids {
        let station = esi
            .group_universe()
            .get_station(*id)
            .await
            .with_context(|| format!("fetching station {id}"))?;
        taxonomy::ensure_type(esi, client, station.type_id).await?;
        db::universe::upsert_station(client, &station).await?;
        debug!(station_id = id, "synced station");
    }
    Ok(())
}
