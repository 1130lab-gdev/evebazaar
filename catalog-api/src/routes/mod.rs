pub mod arbitrage;
pub mod haulers;
pub mod openapi;
pub mod orders;
pub mod price_checks;
pub mod price_watches;
pub mod route_planner;
pub mod search;
pub mod taxonomy;

use axum::{
    Router,
    routing::{get, patch, post, put},
};
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::state::AppState;
use openapi::ApiDoc;

pub fn build_router(state: AppState) -> Router {
    // haulers/runs/route-planner now carry Bearer-token auth (see
    // auth.rs/db/exchange_reads.rs -- role resolved by reading
    // exchange-webapi's `exchange.users` table directly, same
    // cross-service-read pattern as risk/src/db/exchange_reads.rs).
    // taxonomy/search/market-orders/arbitrage/price-watches stay public
    // and unauthenticated. Nothing here depends on the caller's origin,
    // so there's no reason to pin one; wildcard avoids origin-mismatch
    // breakage under proxies/tunnels that don't front the frontend as
    // exactly http://localhost:5173.
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    Router::new()
        .route("/categories", get(taxonomy::list_categories))
        .route("/market-groups", get(taxonomy::list_market_groups))
        .route("/regions", get(taxonomy::list_regions))
        .route("/types/{type_id}", get(taxonomy::get_type))
        .route("/search", get(search::search))
        .route("/market/orders", get(orders::list_orders))
        .route("/market/arbitrage", get(arbitrage::list_opportunities))
        .route("/route-planner", get(route_planner::plan_route))
        .route("/haulers", get(haulers::list_haulers).post(haulers::create_hauler))
        .route(
            "/haulers/{hauler_id}",
            get(haulers::get_hauler).put(haulers::update_hauler).delete(haulers::delete_hauler),
        )
        .route("/haulers/{hauler_id}/runs", get(haulers::list_runs).post(haulers::create_run))
        .route("/runs/{run_id}", get(haulers::get_run).patch(haulers::update_run_status).delete(haulers::delete_run))
        .route("/runs/{run_id}/legs/{run_leg_id}", patch(haulers::set_leg_completed))
        .route("/price-watches", get(price_watches::list_price_watches).post(price_watches::create_price_watch))
        .route(
            "/price-watches/{watch_id}",
            put(price_watches::update_price_watch).delete(price_watches::delete_price_watch),
        )
        .route("/price-checks", post(price_checks::check_prices))
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(cors)
        .with_state(state)
}
