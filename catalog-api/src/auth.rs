use axum::{
    extract::{FromRef, FromRequestParts},
    http::request::Parts,
};

use crate::{
    db::exchange_reads::{self, ExchangeUser},
    error::AppError,
    state::AppState,
};

pub use exchange_reads::ExchangeUserRole as Role;

fn bearer_token(parts: &Parts) -> Result<&str, AppError> {
    parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .filter(|t| !t.is_empty())
        .ok_or(AppError::Unauthorized)
}

/// Resolves `Authorization: Bearer <api key>` against exchange-webapi's
/// `exchange.users` table (via a second, read-only Postgres pool -- see
/// db/exchange_reads.rs), giving every catalog-api route the caller's
/// identity and role without exchange-webapi being in the request path.
pub struct AuthUser(pub ExchangeUser);

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let token = bearer_token(parts)?;
        let user = exchange_reads::user_for_api_key(&app_state.exchange_db, token).await?.ok_or(AppError::Unauthorized)?;
        Ok(AuthUser(user))
    }
}
