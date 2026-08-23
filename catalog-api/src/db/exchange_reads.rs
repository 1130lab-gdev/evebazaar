//! Read-only lookups against exchange-webapi's identity table -- same
//! pattern as risk/src/db/exchange_reads.rs: a second Postgres pool
//! pointed at the `exchange` database, reading a sibling service's table
//! directly rather than an HTTP call per request.

use deadpool_postgres::Pool;
use sha2::{Digest, Sha256};

use crate::error::AppError;

/// Duplicated from exchange-webapi's `auth::hash_api_key` byte-for-byte --
/// there's no shared crate between these two independent, non-workspace
/// services, and this is four lines, not worth a shared-library refactor.
pub fn hash_api_key(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExchangeUserRole {
    Freighter,
    Dispatcher,
    Trader,
    Broker,
    Admin,
}

impl ExchangeUserRole {
    fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "freighter" => Self::Freighter,
            "dispatcher" => Self::Dispatcher,
            "trader" => Self::Trader,
            "broker" => Self::Broker,
            "admin" => Self::Admin,
            _ => return None,
        })
    }

    pub fn satisfies(self, required: Self) -> bool {
        self == Self::Admin || self == required
    }
}

pub struct ExchangeUser {
    pub id: i64,
    pub role: ExchangeUserRole,
}

pub async fn user_for_api_key(pool: &Pool, raw_key: &str) -> Result<Option<ExchangeUser>, AppError> {
    let hash = hash_api_key(raw_key);
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "SELECT id, role::text FROM exchange.users WHERE api_key_hash = $1 AND status = 'active'",
            &[&hash],
        )
        .await?;
    Ok(row.and_then(|r| {
        let role_str: String = r.get(1);
        ExchangeUserRole::from_str(&role_str).map(|role| ExchangeUser { id: r.get(0), role })
    }))
}
