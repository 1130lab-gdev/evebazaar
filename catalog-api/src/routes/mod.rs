pub mod arbitrage;
pub mod openapi;
pub mod orders;
pub mod price_checks;
pub mod route_planner;
pub mod search;
pub mod taxonomy;

use axum::{
    Router,
    http::{HeaderValue, header},
    routing::{get, post},
};
use tower_http::{
    cors::{Any, CorsLayer},
    set_header::SetResponseHeaderLayer,
};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::state::AppState;
use openapi::ApiDoc;

pub fn build_router(state: AppState) -> Router {
    // Every route here is public and unauthenticated -- catalog-api has no
    // accounts or roles. Nothing depends on the caller's origin either, so
    // there's no reason to pin one; wildcard avoids origin-mismatch
    // breakage under proxies/tunnels that don't front the frontend as
    // exactly http://localhost:5173.
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    // Everything served here is read-only market/taxonomy data backed by a
    // ~5-minute sync loop (see the `database` project's MKTDATA_INTERVAL_SECS),
    // so a short shared cache is always safe and lets the browser skip the
    // round trip on pagination, tab switches, re-pinning an item, and
    // shared links. `add` (not `overriding`) so a handler can still opt out
    // with its own Cache-Control if it ever needs to.
    let cache = SetResponseHeaderLayer::if_not_present(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=60"),
    );

    Router::new()
        .route("/categories", get(taxonomy::list_categories))
        .route("/market-groups", get(taxonomy::list_market_groups))
        .route("/regions", get(taxonomy::list_regions))
        .route("/types/{type_id}", get(taxonomy::get_type))
        .route("/search", get(search::search))
        .route("/market/orders", get(orders::list_orders))
        .route("/market/arbitrage", get(arbitrage::list_opportunities))
        .route("/route-planner", get(route_planner::plan_route))
        .route("/price-checks", post(price_checks::check_prices))
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(cache)
        .layer(cors)
        .with_state(state)
}
