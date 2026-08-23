use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use utoipa::ToSchema;

use crate::{
    auth::{AuthUser, Role},
    db::{self, haulers::NewRunLeg},
    domain::{Hauler, HaulerRun, RunStatus},
    error::{AppError, AppResult},
    state::AppState,
};

const DEFAULT_SALES_TAX_PCT: f64 = 7.5;

/// Freighters only ever see/act on haulers they own; dispatchers and
/// admins bypass this (dispatchers need to see every hauler to assign
/// runs; `Role::satisfies` already makes admin bypass everything).
fn check_hauler_owner(role: Role, user_id: i64, hauler: &Hauler) -> AppResult<()> {
    if role == Role::Freighter && hauler.owner_user_id != Some(user_id) {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct HaulerRequest {
    pub name: String,
    pub cargo_capacity_m3: f64,
    pub isk_available: f64,
    /// Same vocabulary as the route planner's `security_profile` param --
    /// `None`/omitted means fewest jumps.
    pub route_security_profile: Option<String>,
    /// Default `start_system_id`/`from_system_id` for this hauler --
    /// `None`/omitted means no default.
    pub home_system_id: Option<i32>,
    /// The owning freighter. Required when an admin creates a hauler on
    /// someone else's behalf; ignored (forced to the caller's own id) when
    /// a freighter creates their own.
    pub owner_user_id: Option<i64>,
}

fn validate_hauler(req: &HaulerRequest) -> AppResult<()> {
    if req.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".to_string()));
    }
    if req.cargo_capacity_m3 <= 0.0 {
        return Err(AppError::BadRequest("cargo_capacity_m3 must be positive".to_string()));
    }
    if req.isk_available < 0.0 {
        return Err(AppError::BadRequest("isk_available must not be negative".to_string()));
    }
    if let Some(profile) = req.route_security_profile.as_deref()
        && profile != "high_sec_only"
        && profile != "low_sec_plus"
    {
        return Err(AppError::BadRequest(
            "route_security_profile must be omitted/null, \"high_sec_only\", or \"low_sec_plus\"".to_string(),
        ));
    }
    Ok(())
}

#[utoipa::path(get, path = "/haulers", tag = "haulers", security(("bearer_auth" = [])), responses((status = 200, body = Vec<Hauler>), (status = 403)))]
pub async fn list_haulers(State(state): State<AppState>, AuthUser(user): AuthUser) -> AppResult<Json<Vec<Hauler>>> {
    let owner = match user.role {
        Role::Freighter => Some(user.id),
        Role::Dispatcher | Role::Admin => None,
        _ => return Err(AppError::Forbidden),
    };
    Ok(Json(db::haulers::list_haulers(&state.db, owner).await?))
}

#[utoipa::path(post, path = "/haulers", tag = "haulers", security(("bearer_auth" = [])), request_body = HaulerRequest, responses((status = 200, body = Hauler), (status = 403)))]
pub async fn create_hauler(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(req): Json<HaulerRequest>,
) -> AppResult<Json<Hauler>> {
    let owner_user_id = match user.role {
        Role::Freighter => user.id,
        Role::Admin => req.owner_user_id.ok_or_else(|| AppError::BadRequest("owner_user_id is required".into()))?,
        _ => return Err(AppError::Forbidden),
    };
    validate_hauler(&req)?;
    let hauler = db::haulers::create_hauler(
        &state.db,
        req.name.trim(),
        req.cargo_capacity_m3,
        req.isk_available,
        req.route_security_profile.as_deref(),
        req.home_system_id,
        owner_user_id,
    )
    .await?;
    Ok(Json(hauler))
}

#[utoipa::path(get, path = "/haulers/{hauler_id}", tag = "haulers", security(("bearer_auth" = [])), responses((status = 200, body = Hauler), (status = 403), (status = 404)))]
pub async fn get_hauler(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(hauler_id): Path<i64>,
) -> AppResult<Json<Hauler>> {
    if !matches!(user.role, Role::Freighter | Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let hauler = db::haulers::get_hauler(&state.db, hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &hauler)?;
    Ok(Json(hauler))
}

#[utoipa::path(
    put, path = "/haulers/{hauler_id}", tag = "haulers", security(("bearer_auth" = [])), request_body = HaulerRequest,
    responses((status = 200, body = Hauler), (status = 403), (status = 404)),
)]
pub async fn update_hauler(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(hauler_id): Path<i64>,
    Json(req): Json<HaulerRequest>,
) -> AppResult<Json<Hauler>> {
    if !matches!(user.role, Role::Freighter | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let existing = db::haulers::get_hauler(&state.db, hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &existing)?;
    validate_hauler(&req)?;
    let hauler = db::haulers::update_hauler(
        &state.db,
        hauler_id,
        req.name.trim(),
        req.cargo_capacity_m3,
        req.isk_available,
        req.route_security_profile.as_deref(),
        req.home_system_id,
    )
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(hauler))
}

#[utoipa::path(delete, path = "/haulers/{hauler_id}", tag = "haulers", security(("bearer_auth" = [])), responses((status = 204), (status = 403), (status = 404)))]
pub async fn delete_hauler(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(hauler_id): Path<i64>,
) -> AppResult<axum::http::StatusCode> {
    if !matches!(user.role, Role::Freighter | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let existing = db::haulers::get_hauler(&state.db, hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &existing)?;
    if db::haulers::delete_hauler(&state.db, hauler_id).await? {
        Ok(axum::http::StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRunRequest {
    pub name: Option<String>,
    pub legs: Vec<CreateRunLegRequest>,
    /// Applied when re-pricing/auto-sizing legs at save time (see
    /// `CreateRunLegRequest::quantity`). Defaults to 7.5%, same as the
    /// arbitrage scanner.
    pub sales_tax_pct: Option<f64>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateRunLegRequest {
    pub type_id: i32,
    pub buy_system_id: i32,
    pub sell_system_id: i32,
    /// Units to buy at this leg. Omit to use the largest amount that fits
    /// both the hauler's cargo hold and their full stated `isk_available`
    /// -- sized independently per leg (not a budget that depletes across
    /// legs in the same request), since a manually-assembled run isn't
    /// guaranteed to be a connected sequential itinerary the way a route
    /// planner result is. A route-planner-built route should pass each
    /// leg's already-computed `quantity` explicitly instead of relying on
    /// this, since the planner *did* account for a depleting budget.
    pub quantity: Option<i64>,
}

/// Creating a run against a hauler *is* "assigning that run to the
/// freighter who owns the hauler" -- there's no separate assignee field.
#[utoipa::path(
    post, path = "/haulers/{hauler_id}/runs", tag = "haulers", security(("bearer_auth" = [])), request_body = CreateRunRequest,
    responses((status = 200, body = HaulerRun), (status = 403), (status = 404), (status = 400)),
)]
pub async fn create_run(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(hauler_id): Path<i64>,
    Json(req): Json<CreateRunRequest>,
) -> AppResult<Json<HaulerRun>> {
    if !matches!(user.role, Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let hauler = db::haulers::get_hauler(&state.db, hauler_id).await?.ok_or(AppError::NotFound)?;
    if req.legs.is_empty() {
        return Err(AppError::BadRequest("a run needs at least one leg".to_string()));
    }
    let sales_tax_pct = req.sales_tax_pct.unwrap_or(DEFAULT_SALES_TAX_PCT);

    let mut legs = Vec::with_capacity(req.legs.len());
    for (i, leg_req) in req.legs.iter().enumerate() {
        let quote = db::arbitrage::quote_leg(&state.db, leg_req.type_id, leg_req.buy_system_id, leg_req.sell_system_id, sales_tax_pct)
            .await?
            .ok_or_else(|| {
                AppError::BadRequest(format!(
                    "leg {}: no live orders on one or both sides of type_id={} between system_id={} and system_id={}",
                    i + 1,
                    leg_req.type_id,
                    leg_req.buy_system_id,
                    leg_req.sell_system_id
                ))
            })?;

        let quantity = match leg_req.quantity {
            Some(q) if q > 0 => q,
            Some(_) => return Err(AppError::BadRequest(format!("leg {}: quantity must be positive", i + 1))),
            None => {
                let units_by_cargo = match quote.packaged_volume {
                    Some(v) if v > 0.0 => (hauler.cargo_capacity_m3 / v).floor() as i64,
                    _ => i64::MAX,
                };
                let units_by_isk = if quote.buy_price > 0.0 { (hauler.isk_available / quote.buy_price).floor() as i64 } else { 0 };
                let units = units_by_cargo.min(quote.available_volume).min(units_by_isk);
                if units <= 0 {
                    return Err(AppError::BadRequest(format!(
                        "leg {}: hauler's cargo/ISK can't afford even one unit at current prices",
                        i + 1
                    )));
                }
                units
            }
        };

        legs.push(NewRunLeg {
            type_id: leg_req.type_id,
            type_name: quote.type_name,
            buy_system_id: leg_req.buy_system_id,
            buy_system_name: quote.buy_system_name,
            sell_system_id: leg_req.sell_system_id,
            sell_system_name: quote.sell_system_name,
            buy_price: quote.buy_price,
            sell_price: quote.sell_price,
            quantity,
            expected_profit: quantity as f64 * (quote.net_sell_price - quote.buy_price),
        });
    }

    let run = db::haulers::create_run(&state.db, hauler_id, req.name.as_deref(), &legs).await?;
    Ok(Json(run))
}

#[utoipa::path(get, path = "/haulers/{hauler_id}/runs", tag = "haulers", security(("bearer_auth" = [])), responses((status = 200, body = Vec<HaulerRun>), (status = 403)))]
pub async fn list_runs(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(hauler_id): Path<i64>,
) -> AppResult<Json<Vec<HaulerRun>>> {
    if !matches!(user.role, Role::Freighter | Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let hauler = db::haulers::get_hauler(&state.db, hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &hauler)?;
    Ok(Json(db::haulers::list_runs_for_hauler(&state.db, hauler_id).await?))
}

#[utoipa::path(get, path = "/runs/{run_id}", tag = "haulers", security(("bearer_auth" = [])), responses((status = 200, body = HaulerRun), (status = 403), (status = 404)))]
pub async fn get_run(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(run_id): Path<i64>,
) -> AppResult<Json<HaulerRun>> {
    if !matches!(user.role, Role::Freighter | Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let run = db::haulers::get_run(&state.db, run_id).await?.ok_or(AppError::NotFound)?;
    let hauler = db::haulers::get_hauler(&state.db, run.hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &hauler)?;
    Ok(Json(run))
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRunStatusRequest {
    pub status: RunStatus,
}

#[utoipa::path(
    patch, path = "/runs/{run_id}", tag = "haulers", security(("bearer_auth" = [])), request_body = UpdateRunStatusRequest,
    responses((status = 200, body = HaulerRun), (status = 403), (status = 404)),
)]
pub async fn update_run_status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(run_id): Path<i64>,
    Json(req): Json<UpdateRunStatusRequest>,
) -> AppResult<Json<HaulerRun>> {
    if !matches!(user.role, Role::Freighter | Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let existing = db::haulers::get_run(&state.db, run_id).await?.ok_or(AppError::NotFound)?;
    let hauler = db::haulers::get_hauler(&state.db, existing.hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &hauler)?;
    let run = db::haulers::update_run_status(&state.db, run_id, req.status).await?.ok_or(AppError::NotFound)?;
    Ok(Json(run))
}

#[utoipa::path(delete, path = "/runs/{run_id}", tag = "haulers", security(("bearer_auth" = [])), responses((status = 204), (status = 403), (status = 404)))]
pub async fn delete_run(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(run_id): Path<i64>,
) -> AppResult<axum::http::StatusCode> {
    if !matches!(user.role, Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    if db::haulers::delete_run(&state.db, run_id).await? {
        Ok(axum::http::StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SetLegCompletedRequest {
    pub completed: bool,
}

#[utoipa::path(
    patch, path = "/runs/{run_id}/legs/{run_leg_id}", tag = "haulers", security(("bearer_auth" = [])), request_body = SetLegCompletedRequest,
    responses((status = 204), (status = 403), (status = 404)),
)]
pub async fn set_leg_completed(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((run_id, run_leg_id)): Path<(i64, i64)>,
    Json(req): Json<SetLegCompletedRequest>,
) -> AppResult<axum::http::StatusCode> {
    if !matches!(user.role, Role::Freighter | Role::Dispatcher | Role::Admin) {
        return Err(AppError::Forbidden);
    }
    let run = db::haulers::get_run(&state.db, run_id).await?.ok_or(AppError::NotFound)?;
    let hauler = db::haulers::get_hauler(&state.db, run.hauler_id).await?.ok_or(AppError::NotFound)?;
    check_hauler_owner(user.role, user.id, &hauler)?;
    if db::haulers::set_leg_completed(&state.db, run_leg_id, req.completed).await? {
        Ok(axum::http::StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}
