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
}
