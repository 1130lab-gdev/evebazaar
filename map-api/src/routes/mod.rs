pub mod activity;
pub mod openapi;
pub mod route;
pub mod stargates;
pub mod taxonomy;

use axum::{Router, routing::get};
use tower_http::cors::{Any, CorsLayer};
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
        .layer(cors)
        .with_state(state)
}
