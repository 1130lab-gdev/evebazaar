use std::collections::HashSet;

use axum::{Json, extract::State};
// axum::extract::Query (serde_urlencoded) can't deserialize a repeated
// query key into a Vec at all -- axum_extra's Query (serde_html_form)
// does, which avoid_system_id below needs.
use axum_extra::extract::Query;
use serde::Deserialize;

use crate::{
    db,
    domain::{RouteLeg, RouteLegKind, RouteResponse, RouteSystem, SystemActivity},
    error::{AppError, AppResult},
    graph::{EdgeKind, SecurityMultipliers},
    state::AppState,
};

const DEFAULT_WARP_SPEED_AU_S: f64 = 3.0;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct RouteParams {
    pub source_system_id: i32,
    pub target_system_id: i32,
    pub warp_speed_au_s: Option<f64>,
    /// One of `fastest` (default, no extra weight to any security class),
    /// `high_sec_only` (low/null-sec cost 10000x), `low_sec_plus`
    /// (null-sec costs 10000x, low-sec unweighted). Any of the `*_mult`
    /// params below overrides that profile's value for just that class.
    pub profile: Option<String>,
    pub highsec_mult: Option<f64>,
    pub lowsec_mult: Option<f64>,
    pub nullsec_mult: Option<f64>,
    /// System ids the route must not pass through (the source system is
    /// exempt -- see `Graph::find_route`'s doc comment). Repeatable.
    #[serde(default)]
    pub avoid_system_id: Vec<i32>,
}

fn resolve_multipliers(params: &RouteParams) -> SecurityMultipliers {
    let mut multipliers = match params.profile.as_deref() {
        Some("high_sec_only") => SecurityMultipliers::HIGH_SEC_ONLY,
        Some("low_sec_plus") => SecurityMultipliers::LOW_SEC_PLUS,
        _ => SecurityMultipliers::FASTEST,
    };
    if let Some(v) = params.highsec_mult {
        multipliers.highsec = v;
    }
    if let Some(v) = params.lowsec_mult {
        multipliers.lowsec = v;
    }
    if let Some(v) = params.nullsec_mult {
        multipliers.nullsec = v;
    }
    multipliers
}

#[utoipa::path(
    get,
    path = "/route",
    tag = "route",
    params(RouteParams),
    responses(
        (status = 200, description = "Lowest-cost route between two systems, annotated with per-system activity and stations", body = RouteResponse),
        (status = 404, description = "Unknown system, or no stargate path exists between them"),
    ),
)]
pub async fn get_route(State(state): State<AppState>, Query(params): Query<RouteParams>) -> AppResult<Json<RouteResponse>> {
    let warp_speed_au_s = params.warp_speed_au_s.unwrap_or(DEFAULT_WARP_SPEED_AU_S);
    let multipliers = resolve_multipliers(&params);

    if params.source_system_id == params.target_system_id {
        if !state.graph.system_exists(params.source_system_id) {
            return Err(AppError::NotFound);
        }
        let systems = build_route_systems(&state, &[params.source_system_id]).await?;
        return Ok(Json(RouteResponse { total_time_s: 0.0, total_jumps: 0, systems, legs: Vec::new() }));
    }

    let avoid_system_ids: HashSet<i32> = params.avoid_system_id.iter().copied().collect();
    let path = state
        .graph
        .find_route(params.source_system_id, params.target_system_id, warp_speed_au_s, multipliers, &avoid_system_ids)
        .ok_or(AppError::NotFound)?;

    let mut system_order: Vec<i32> = Vec::new();
    if let Some(first) = path.edges.first() {
        system_order.push(first.from_system_id);
    }
    let mut total_jumps = 0u32;
    let mut legs = Vec::with_capacity(path.edges.len());
    for edge in &path.edges {
        if system_order.last() != Some(&edge.to_system_id) {
            system_order.push(edge.to_system_id);
        }
        if edge.kind == EdgeKind::Jump {
            total_jumps += 1;
        }
        legs.push(RouteLeg {
            kind: match edge.kind {
                EdgeKind::Jump => RouteLegKind::Jump,
                EdgeKind::Warp => RouteLegKind::Warp,
            },
            from_stargate_id: edge.from_stargate_id,
            from_system_id: edge.from_system_id,
            to_stargate_id: edge.to_stargate_id,
            to_system_id: edge.to_system_id,
            time_s: edge.time_s,
        });
    }

    let systems = build_route_systems(&state, &system_order).await?;

    Ok(Json(RouteResponse { total_time_s: path.total_time_s, total_jumps, systems, legs }))
}

/// Bundles `SystemSummary`-shaped identity/grouping data, current
/// kill/jump activity, and stations for each system in `system_ids`,
/// preserving that slice's order.
async fn build_route_systems(state: &AppState, system_ids: &[i32]) -> AppResult<Vec<RouteSystem>> {
    let info = db::route::system_info(&state.db, system_ids).await?;
    let activity = db::activity::list_activity(&state.db, Some(system_ids), None, None).await?;
    let mut activity_by_system: std::collections::HashMap<i32, SystemActivity> =
        activity.into_iter().map(|a| (a.system_id, a)).collect();
    let mut stations = db::route::stations_by_system(&state.db, system_ids).await?;

    system_ids
        .iter()
        .map(|&system_id| {
            let (name, constellation_id, region_id, region_name, security_status) =
                info.get(&system_id).cloned().ok_or(AppError::NotFound)?;
            let activity = activity_by_system.remove(&system_id).unwrap_or(SystemActivity {
                system_id,
                ship_kills: 0,
                npc_kills: 0,
                pod_kills: 0,
                ship_jumps: 0,
            });
            Ok(RouteSystem {
                system_id,
                name,
                constellation_id,
                region_id,
                region_name,
                security_status,
                ship_kills: activity.ship_kills,
                npc_kills: activity.npc_kills,
                pod_kills: activity.pod_kills,
                ship_jumps: activity.ship_jumps,
                stations: stations.remove(&system_id).unwrap_or_default(),
            })
        })
        .collect()
}
