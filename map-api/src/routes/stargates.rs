use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;

use crate::{
    db,
    domain::{Stargate, StargateDistance},
    error::AppResult,
    state::AppState,
};

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct StargateParams {
    pub region_id: Option<i32>,
    pub constellation_id: Option<i32>,
    pub system_id: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/stargates",
    tag = "stargates",
    params(StargateParams),
    responses((
        status = 200,
        description = "The jump graph: every stargate as a directed edge to its destination, with galactic jump distance",
        body = Vec<Stargate>,
    )),
)]
pub async fn list_stargates(State(state): State<AppState>, Query(params): Query<StargateParams>) -> AppResult<Json<Vec<Stargate>>> {
    Ok(Json(db::stargates::list_stargates(&state.db, params.region_id, params.constellation_id, params.system_id).await?))
}

#[utoipa::path(
    get,
    path = "/systems/{system_id}/stargate-distances",
    tag = "stargates",
    params(("system_id" = i32, Path, description = "EVE system_id")),
    responses((
        status = 200,
        description = "Pairwise in-system distance between every stargate in this system",
        body = Vec<StargateDistance>,
    )),
)]
pub async fn stargate_distances(State(state): State<AppState>, Path(system_id): Path<i32>) -> AppResult<Json<Vec<StargateDistance>>> {
    Ok(Json(db::stargates::pairwise_distances(&state.db, system_id).await?))
}
