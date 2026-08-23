use utoipa::OpenApi;

use crate::domain::{
    Constellation, Region, RouteLeg, RouteLegKind, RouteResponse, RouteSystem, Stargate, StargateDistance, Station, SystemActivity,
    SystemSummary,
};

use super::{activity, route, stargates, taxonomy};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "map-api",
        description = "Read-only access to New Eden's stargate network: systems, region/constellation grouping, jump/in-system distances, kill/jump activity, and route planning.",
    ),
    paths(
        taxonomy::list_regions,
        taxonomy::list_constellations,
        taxonomy::list_systems,
        taxonomy::get_system,
        stargates::list_stargates,
        stargates::stargate_distances,
        activity::list_activity,
        route::get_route,
    ),
    components(schemas(
        Region,
        Constellation,
        SystemSummary,
        Stargate,
        StargateDistance,
        SystemActivity,
        Station,
        RouteSystem,
        RouteLegKind,
        RouteLeg,
        RouteResponse,
    )),
    tags(
        (name = "taxonomy", description = "Regions, constellations, and systems"),
        (name = "stargates", description = "The jump graph, in-system gate distances, and activity"),
        (name = "route", description = "Route planning"),
    ),
)]
pub struct ApiDoc;
