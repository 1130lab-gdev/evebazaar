use axum::{
    Json,
    extract::{Path, State},
};

use crate::{
    db,
    domain::{Category, MarketGroup, Region, TypeDetail},
    error::{AppError, AppResult},
    state::AppState,
};

#[utoipa::path(
    get,
    path = "/categories",
    tag = "taxonomy",
    responses((status = 200, description = "Published item categories", body = Vec<Category>)),
)]
pub async fn list_categories(State(state): State<AppState>) -> AppResult<Json<Vec<Category>>> {
    Ok(Json(db::taxonomy::list_categories(&state.db).await?))
}

#[utoipa::path(
    get,
    path = "/market-groups",
    tag = "taxonomy",
    responses((
        status = 200,
        description = "Flat list of market groups; build the tree client-side via parent_group_id",
        body = Vec<MarketGroup>,
    )),
)]
pub async fn list_market_groups(State(state): State<AppState>) -> AppResult<Json<Vec<MarketGroup>>> {
    Ok(Json(db::taxonomy::list_market_groups(&state.db).await?))
}

#[utoipa::path(
    get,
    path = "/regions",
    tag = "taxonomy",
    responses((status = 200, description = "All EVE regions", body = Vec<Region>)),
)]
pub async fn list_regions(State(state): State<AppState>) -> AppResult<Json<Vec<Region>>> {
    Ok(Json(db::taxonomy::list_regions(&state.db).await?))
}

#[utoipa::path(
    get,
    path = "/types/{type_id}",
    tag = "taxonomy",
    params(("type_id" = i32, Path, description = "EVE type_id")),
    responses(
        (status = 200, description = "Item detail", body = TypeDetail),
        (status = 404, description = "No such type_id"),
    ),
)]
pub async fn get_type(State(state): State<AppState>, Path(type_id): Path<i32>) -> AppResult<Json<TypeDetail>> {
    db::taxonomy::get_type(&state.db, type_id).await?.map(Json).ok_or(AppError::NotFound)
}
