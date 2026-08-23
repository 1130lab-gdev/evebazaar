use axum::{Json, extract::State};
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{db, domain::LegPriceCheck, error::AppResult, state::AppState};

const DEFAULT_SALES_TAX_PCT: f64 = 7.5;

#[derive(Debug, Deserialize, ToSchema)]
pub struct PriceCheckLegRequest {
    pub type_id: i32,
    pub buy_system_id: i32,
    pub sell_system_id: i32,
    /// The quantity this leg was sized for -- compared against the live
    /// `current_available_volume` to decide `still_viable`, not just
    /// whether the pairing is profitable at all.
    pub quantity: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct PriceCheckRequest {
    pub legs: Vec<PriceCheckLegRequest>,
    pub sales_tax_pct: Option<f64>,
}

/// Re-quotes a batch of (previously saved or previewed) legs against the
/// live market in one request -- stateless, so it works equally for a
/// saved run's legs (`HaulerRunLeg`) and an in-memory route plan's legs
/// (`RoutePlanLeg`) alike, both of which already have everything a leg
/// needs here on hand. Results come back in the same order as `legs` was
/// submitted so the caller can zip them back onto its own list by index
/// rather than needing a shared id.
#[utoipa::path(
    post, path = "/price-checks", tag = "price-checks", request_body = PriceCheckRequest,
    responses((status = 200, body = Vec<LegPriceCheck>)),
)]
pub async fn check_prices(State(state): State<AppState>, Json(req): Json<PriceCheckRequest>) -> AppResult<Json<Vec<LegPriceCheck>>> {
    let sales_tax_pct = req.sales_tax_pct.unwrap_or(DEFAULT_SALES_TAX_PCT);

    let mut checks = Vec::with_capacity(req.legs.len());
    for leg in &req.legs {
        let quote = db::arbitrage::quote_leg(&state.db, leg.type_id, leg.buy_system_id, leg.sell_system_id, sales_tax_pct).await?;
        checks.push(match quote {
            Some(q) => {
                let profit_per_unit = q.net_sell_price - q.buy_price;
                LegPriceCheck {
                    current_buy_price: Some(q.buy_price),
                    current_sell_price: Some(q.sell_price),
                    current_net_sell_price: Some(q.net_sell_price),
                    current_profit_per_unit: Some(profit_per_unit),
                    current_available_volume: Some(q.available_volume),
                    still_viable: profit_per_unit > 0.0 && q.available_volume >= leg.quantity,
                }
            }
            None => LegPriceCheck {
                current_buy_price: None,
                current_sell_price: None,
                current_net_sell_price: None,
                current_profit_per_unit: None,
                current_available_volume: None,
                still_viable: false,
            },
        });
    }
    Ok(Json(checks))
}
