use std::net::SocketAddr;

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(version, about, long_about = None)]
pub struct Config {
    /// Address the HTTP server listens on.
    #[arg(long, env = "LISTEN_ADDR", default_value = "0.0.0.0:8091")]
    pub listen_addr: SocketAddr,

    /// Postgres connection string for the `eve` database the `database`
    /// project maintains from ESI. Read-only: this service never writes to
    /// it, same posture as risk's `eve_database_url`.
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://eve:eve@localhost:5532/eve")]
    pub database_url: String,

    /// Postgres connection string for the `exchange` database (same
    /// database exchange-webapi and risk use). Read-only: catalog-api
    /// never writes exchange.* -- it only resolves a caller's Bearer key
    /// to their role, same pattern as risk/src/db/exchange_reads.rs.
    #[arg(
        long,
        env = "EXCHANGE_DATABASE_URL",
        default_value = "postgres://postgres:postgres@localhost:5533/exchange"
    )]
    pub exchange_database_url: String,
}
