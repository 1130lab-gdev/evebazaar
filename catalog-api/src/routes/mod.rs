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

pub fn build_router(state: AppState, api_base_path: &str) -> Router {
    // Normalise: no trailing slash, guaranteed leading slash when non-empty.
    // `Router::nest` panics on a path that doesn't start with '/', so fix it
    // here rather than trip over a misconfigured API_BASE_PATH at startup.
    let base = api_base_path.trim().trim_end_matches('/');
    let base = if base.is_empty() || base.starts_with('/') {
        base.to_string()
    } else {
        format!("/{base}")
    };

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

    let routes = Router::new()
        .route("/categories", get(taxonomy::list_categories))
        .route("/market-groups", get(taxonomy::list_market_groups))
        .route("/regions", get(taxonomy::list_regions))
        .route("/types/{type_id}", get(taxonomy::get_type))
        .route("/search", get(search::search))
        .route("/market/orders", get(orders::list_orders))
        .route("/market/arbitrage", get(arbitrage::list_opportunities))
        .route("/route-planner", get(route_planner::plan_route))
        .route("/price-checks", post(price_checks::check_prices));

    let routes = if base.is_empty() {
        routes
    } else {
        Router::new().nest(&base, routes)
    };

    // Swagger UI and the OpenAPI JSON have to carry the prefix explicitly:
    // the URL passed to `.url()` is baked into the served page, so it can't
    // rely on `nest` rewriting it. The `servers` entry makes "Try it out"
    // hit the prefixed path too.
    let mut api_doc = ApiDoc::openapi();
    if !base.is_empty() {
        api_doc.servers = Some(vec![utoipa::openapi::Server::new(&base)]);
    }
    let swagger = SwaggerUi::new(format!("{base}/swagger-ui"))
        .url(format!("{base}/api-docs/openapi.json"), api_doc);

    routes
        .merge(swagger)
        .layer(cache)
        .layer(cors)
        .with_state(state)
}
