use axum::{Json, extract::State};
// axum::extract::Query (serde_urlencoded) can't deserialize a repeated
// query key into a Vec at all -- axum_extra's Query (serde_html_form)
// does, which region_id/security_class below need.
use axum_extra::extract::Query;
use serde::Deserialize;

use crate::{
    db::{self, orders::OrderFilter},
    domain::MarketOrder,
    error::AppResult,
    state::AppState,
};

const DEFAULT_LIMIT: i64 = 25;
const MAX_LIMIT: i64 = 100;

#[derive(Debug, Deserialize, utoipa::IntoParams)]
pub struct OrdersParams {
    pub type_id: i32,
    #[serde(default)]
    pub region_id: Vec<i32>,
    /// "buy", "sell", or omitted for both.
    pub side: Option<String>,
    pub min_price: Option<f64>,
    pub max_price: Option<f64>,
    pub min_qty: Option<i32>,
    #[serde(default)]
    pub security_class: Vec<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[utoipa::path(
    get,
    path = "/market/orders",
    tag = "orders",
    params(OrdersParams),
    responses((status = 200, description = "Market orders for a type, filtered and paginated", body = Vec<MarketOrder>)),
)]
pub async fn list_orders(State(state): State<AppState>, Query(params): Query<OrdersParams>) -> AppResult<Json<Vec<MarketOrder>>> {
    let filter = OrderFilter {
        region_ids: (!params.region_id.is_empty()).then_some(params.region_id),
        is_buy_order: match params.side.as_deref() {
            Some("buy") => Some(true),
            Some("sell") => Some(false),
            _ => None,
        },
        min_price: params.min_price,
        max_price: params.max_price,
        min_volume_remain: params.min_qty,
        security_classes: (!params.security_class.is_empty()).then_some(params.security_class),
        limit: params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT),
        offset: params.offset.unwrap_or(0).max(0),
    };
    Ok(Json(db::orders::list_for_type(&state.db, params.type_id, &filter).await?))
}
