pub mod activity;
pub mod openapi;
pub mod route;
pub mod stargates;
pub mod taxonomy;

use axum::{
    Router,
    http::{HeaderValue, header},
    routing::get,
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

    // Fully public, unauthenticated, read-only data -- no credentials are
    // ever sent, so there's no reason to pin this to one origin (see
    // catalog-api, which shipped pinned to http://localhost:5173 and broke
    // under the frontend's actual browser origin).
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    // Universe topology (systems/stargates) is loaded once at startup and
    // only changes on a rare SDE update + restart; `/route` is a pure
    // function of that graph plus its params; `/system-activity` is the
    // only time-varying endpoint and its data is hour-granularity anyway.
    // A 2-minute shared cache is safe for all of them and lets the browser
    // skip the round trip when a user toggles route profiles or revisits a
    // system. `if_not_present` so a handler can still opt out.
    let cache = SetResponseHeaderLayer::if_not_present(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=120"),
    );

    let routes = Router::new()
        .route("/regions", get(taxonomy::list_regions))
        .route("/constellations", get(taxonomy::list_constellations))
        .route("/systems", get(taxonomy::list_systems))
        .route("/systems/{system_id}", get(taxonomy::get_system))
        .route("/stargates", get(stargates::list_stargates))
        .route("/systems/{system_id}/stargate-distances", get(stargates::stargate_distances))
        .route("/system-activity", get(activity::list_activity))
        .route("/route", get(route::get_route));

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
