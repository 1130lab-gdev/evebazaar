use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    db,
    domain::PriceWatch,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Debug, Deserialize, ToSchema)]
pub struct PriceWatchRequest {
    pub type_id: i32,
    /// Usually what the trader paid, but just a comparison point -- nothing
    /// enforces that it came from a real purchase.
    pub reference_price: f64,
    /// Percent above `reference_price` the best live buy order needs to
    /// clear for this watch to trigger. e.g. 10 means "alert me once
    /// someone's offering at least 10% more than I paid."
    pub threshold_pct: f64,
}

fn validate(req: &PriceWatchRequest) -> AppResult<()> {
    if req.reference_price <= 0.0 {
        return Err(AppError::BadRequest("reference_price must be positive".to_string()));
    }
    if req.threshold_pct < 0.0 {
        return Err(AppError::BadRequest("threshold_pct must not be negative".to_string()));
    }
    Ok(())
}

#[utoipa::path(get, path = "/price-watches", tag = "price-watches", responses((status = 200, body = Vec<PriceWatch>)))]
pub async fn list_price_watches(State(state): State<AppState>) -> AppResult<Json<Vec<PriceWatch>>> {
    Ok(Json(db::price_watches::list_price_watches(&state.db).await?))
}

#[utoipa::path(
    post, path = "/price-watches", tag = "price-watches", request_body = PriceWatchRequest,
    responses((status = 200, body = PriceWatch), (status = 400), (status = 404)),
)]
pub async fn create_price_watch(State(state): State<AppState>, Json(req): Json<PriceWatchRequest>) -> AppResult<Json<PriceWatch>> {
    validate(&req)?;
    // Checked up front rather than left to fail at the INSERT (which has
    // no FK to catch it -- see db/bootstrap.rs) so a typo'd/nonexistent
    // type_id comes back as a clear 404 instead of a watch that silently
    // never resolves a name or price.
    db::taxonomy::get_type(&state.db, req.type_id).await?.ok_or(AppError::NotFound)?;
    let watch = db::price_watches::create_price_watch(&state.db, req.type_id, req.reference_price, req.threshold_pct).await?;
    Ok(Json(watch))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdatePriceWatchRequest {
    pub reference_price: f64,
    pub threshold_pct: f64,
}

#[utoipa::path(
    put, path = "/price-watches/{watch_id}", tag = "price-watches", request_body = UpdatePriceWatchRequest,
    responses((status = 200, body = PriceWatch), (status = 404)),
)]
pub async fn update_price_watch(
    State(state): State<AppState>,
    Path(watch_id): Path<i64>,
    Json(req): Json<UpdatePriceWatchRequest>,
) -> AppResult<Json<PriceWatch>> {
    if req.reference_price <= 0.0 {
        return Err(AppError::BadRequest("reference_price must be positive".to_string()));
    }
    if req.threshold_pct < 0.0 {
        return Err(AppError::BadRequest("threshold_pct must not be negative".to_string()));
    }
    let watch = db::price_watches::update_price_watch(&state.db, watch_id, req.reference_price, req.threshold_pct)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(watch))
}

#[utoipa::path(delete, path = "/price-watches/{watch_id}", tag = "price-watches", responses((status = 204), (status = 404)))]
pub async fn delete_price_watch(State(state): State<AppState>, Path(watch_id): Path<i64>) -> AppResult<axum::http::StatusCode> {
    if db::price_watches::delete_price_watch(&state.db, watch_id).await? {
        Ok(axum::http::StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}
