use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;

use crate::{db, domain::SearchResult, error::AppResult, state::AppState};

const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 50;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct SearchParams {
    /// Free-text item name query.
    pub q: String,
    pub limit: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/search",
    tag = "search",
    params(SearchParams),
    responses((status = 200, description = "Ranked item matches", body = Vec<SearchResult>)),
)]
pub async fn search(State(state): State<AppState>, Query(params): Query<SearchParams>) -> AppResult<Json<Vec<SearchResult>>> {
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    Ok(Json(db::search::search_types(&state.db, params.q.trim(), limit).await?))
}
