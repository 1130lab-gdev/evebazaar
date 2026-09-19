use std::net::SocketAddr;

use clap::Parser;

#[derive(Parser, Debug, Clone)]
#[command(version, about, long_about = None)]
pub struct Config {
    /// Address the HTTP server listens on.
    #[arg(long, env = "LISTEN_ADDR", default_value = "0.0.0.0:8092")]
    pub listen_addr: SocketAddr,

    /// Postgres connection string for the `eve` database the `database`
    /// project maintains from ESI. Read-only: this service never writes to
    /// it, same posture as risk's `eve_database_url` and catalog-api.
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://eve:eve@localhost:5532/eve")]
    pub database_url: String,

    /// Path prefix every route (API, Swagger UI, OpenAPI JSON) is served
    /// under -- set to `/api/map` when this sits behind a shared-domain
    /// reverse proxy that forwards `/api/map/*` here without stripping the
    /// prefix. Empty (the default) serves at the root, as before. A missing
    /// leading slash and any trailing slash are fixed up.
    #[arg(long, env = "API_BASE_PATH", default_value = "")]
    pub api_base_path: String,
}
