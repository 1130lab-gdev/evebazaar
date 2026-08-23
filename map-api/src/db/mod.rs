pub mod activity;
pub mod route;
pub mod stargates;
pub mod taxonomy;

use anyhow::{Context, Result};
use deadpool_postgres::{Pool, Runtime};
use tokio_postgres::NoTls;

pub fn build_pool(database_url: &str) -> Result<Pool> {
    let mut cfg = deadpool_postgres::Config::new();
    cfg.url = Some(database_url.to_string());
    cfg.create_pool(Some(Runtime::Tokio1), NoTls).context("building postgres pool")
}
