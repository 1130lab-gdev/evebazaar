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

pub fn build_router(state: AppState) -> Router {
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

    Router::new()
        .route("/regions", get(taxonomy::list_regions))
        .route("/constellations", get(taxonomy::list_constellations))
        .route("/systems", get(taxonomy::list_systems))
        .route("/systems/{system_id}", get(taxonomy::get_system))
        .route("/stargates", get(stargates::list_stargates))
        .route("/systems/{system_id}/stargate-distances", get(stargates::stargate_distances))
        .route("/system-activity", get(activity::list_activity))
        .route("/route", get(route::get_route))
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .layer(cache)
        .layer(cors)
        .with_state(state)
}
