use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;

use crate::{db, domain::SystemActivity, error::AppResult, state::AppState};

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct ActivityParams {
    pub region_id: Option<i32>,
    pub constellation_id: Option<i32>,
    pub system_id: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/system-activity",
    tag = "stargates",
    params(ActivityParams),
    responses((status = 200, description = "Ship/pod/NPC kills and ship jumps in the last hour, per ESI", body = Vec<SystemActivity>)),
)]
pub async fn list_activity(State(state): State<AppState>, Query(params): Query<ActivityParams>) -> AppResult<Json<Vec<SystemActivity>>> {
    let system_ids = params.system_id.map(|id| [id]);
    Ok(Json(db::activity::list_activity(&state.db, system_ids.as_ref().map(|a| a.as_slice()), params.region_id, params.constellation_id).await?))
}
