use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;

use crate::{
    db,
    domain::{Constellation, Region, SystemSummary},
    error::{AppError, AppResult},
    state::AppState,
};

#[utoipa::path(
    get,
    path = "/regions",
    tag = "taxonomy",
    responses((status = 200, description = "All EVE regions", body = Vec<Region>)),
)]
pub async fn list_regions(State(state): State<AppState>) -> AppResult<Json<Vec<Region>>> {
    Ok(Json(db::taxonomy::list_regions(&state.db).await?))
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ConstellationParams {
    pub region_id: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/constellations",
    tag = "taxonomy",
    params(ConstellationParams),
    responses((status = 200, description = "Constellations, optionally scoped to a region", body = Vec<Constellation>)),
)]
pub async fn list_constellations(
    State(state): State<AppState>,
    Query(params): Query<ConstellationParams>,
) -> AppResult<Json<Vec<Constellation>>> {
    Ok(Json(db::taxonomy::list_constellations(&state.db, params.region_id).await?))
}

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct SystemParams {
    pub region_id: Option<i32>,
    pub constellation_id: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/systems",
    tag = "taxonomy",
    params(SystemParams),
    responses((status = 200, description = "Solar systems, optionally scoped to a region or constellation", body = Vec<SystemSummary>)),
)]
pub async fn list_systems(State(state): State<AppState>, Query(params): Query<SystemParams>) -> AppResult<Json<Vec<SystemSummary>>> {
    Ok(Json(db::taxonomy::list_systems(&state.db, params.region_id, params.constellation_id).await?))
}

#[utoipa::path(
    get,
    path = "/systems/{system_id}",
    tag = "taxonomy",
    params(("system_id" = i32, Path, description = "EVE system_id")),
    responses(
        (status = 200, description = "System detail", body = SystemSummary),
        (status = 404, description = "No such system_id"),
    ),
)]
pub async fn get_system(State(state): State<AppState>, Path(system_id): Path<i32>) -> AppResult<Json<SystemSummary>> {
    db::taxonomy::get_system(&state.db, system_id).await?.map(Json).ok_or(AppError::NotFound)
}
