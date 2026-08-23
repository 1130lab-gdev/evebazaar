use anyhow::{Context, Result};
use deadpool_postgres::Pool;

/// Idempotent, applied on every startup -- same posture as tgi's
/// `bootstrap_schema`. `types` and its taxonomy tables are owned by the
/// `database` project's `00-startup.sql`, but this index is purely a search
/// optimization for catalog-api's own `/search` endpoint, not a schema
/// change either of those projects needs to know about.
///
/// `catalog_api.*` is a different concern from everything else in this
/// file: haulers/runs are catalog-api's own read-write app state (the
/// first this service has ever needed), not ESI-synced data, so it lives
/// in its own schema rather than `public` where the `database` project's
/// sync-owned tables live -- same Postgres database (this repo's sandbox
/// environment doesn't have a way to provision a whole separate one), but
/// namespaced so it's never mistaken for sync output and never at risk if
/// that project's bootstrap script ever changes shape.
pub async fn run(pool: &Pool) -> Result<()> {
    let client = pool.get().await.context("getting connection for bootstrap")?;
    client
        .batch_execute(
            "
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
            CREATE INDEX IF NOT EXISTS idx_types_name_trgm ON types USING GIN (name gin_trgm_ops);

            -- The arbitrage/route-planner engine's core query (find_opportunities)
            -- picks, per type, the single best sell-side and buy-side order
            -- with `DISTINCT ON (type_id) ... WHERE is_buy_order = $x ORDER BY
            -- type_id, price` -- without this, the only indexes available
            -- (type_id alone, or region_id+type_id) can't produce that order,
            -- so Postgres falls back to a full scan of ~70% of the table (one
            -- side of the market isn't selective at all) followed by an
            -- explicit sort. INCLUDEing system_id/volume_remain (both also
            -- selected by that same query) turns it into a true index-only
            -- scan -- measured, this took the per-side query from ~1.8s to
            -- ~0.1s on a freshly-vacuumed table. Created CONCURRENTLY by hand
            -- against the already-large live table this migration was
            -- written for; IF NOT EXISTS makes that a no-op here on restart,
            -- and a plain (non-concurrent, briefly write-locking) create is
            -- fine for a from-scratch environment where the table doesn't yet
            -- have enough rows for that to matter.
            CREATE INDEX IF NOT EXISTS idx_market_orders_side_type_price
                ON market_orders (is_buy_order, type_id, price) INCLUDE (system_id, volume_remain);

            CREATE SCHEMA IF NOT EXISTS catalog_api;

            CREATE TABLE IF NOT EXISTS catalog_api.haulers (
                hauler_id               BIGSERIAL PRIMARY KEY,
                name                    TEXT NOT NULL,
                cargo_capacity_m3       DOUBLE PRECISION NOT NULL,
                isk_available           DOUBLE PRECISION NOT NULL,
                route_security_profile  TEXT CHECK (route_security_profile IN ('high_sec_only', 'low_sec_plus')),
                -- No FK to (public-schema, sync-owned) solar_systems --
                -- same reasoning as hauler_run_legs' buy/sell system ids
                -- below: this service's read side should never break just
                -- because a system id it stored can't be resolved.
                home_system_id          INTEGER,
                created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            -- Covers haulers created before these columns existed -- CREATE
            -- TABLE IF NOT EXISTS above is a no-op against an
            -- already-created table, so each needs its own idempotent add.
            -- NULL route_security_profile means fewest jumps, same as an
            -- unset security_profile query param elsewhere; NULL
            -- home_system_id means no default buy-from system.
            ALTER TABLE catalog_api.haulers ADD COLUMN IF NOT EXISTS route_security_profile TEXT
                CHECK (route_security_profile IN ('high_sec_only', 'low_sec_plus'));
            ALTER TABLE catalog_api.haulers ADD COLUMN IF NOT EXISTS home_system_id INTEGER;
            -- Owning freighter (exchange.users.id -- a different Postgres
            -- database than this one, so no FK is possible or desired,
            -- same reasoning as home_system_id above: this service's data
            -- should never break because an id from another service's
            -- database can't be resolved). NULL for haulers created
            -- before ownership existed.
            ALTER TABLE catalog_api.haulers ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;

            -- A run pins an ordered sequence of buy/sell legs (hauler_run_legs)
            -- to a hauler -- a single-leg run is 'pin one route+trade to a
            -- hauler', a multi-leg run is what the route planner builds
            -- ('buy at Jita, sell at Amarr, buy at Amarr, sell at Manifest...'),
            -- same shape either way.
            CREATE TABLE IF NOT EXISTS catalog_api.hauler_runs (
                run_id     BIGSERIAL PRIMARY KEY,
                hauler_id  BIGINT NOT NULL REFERENCES catalog_api.haulers (hauler_id) ON DELETE CASCADE,
                name       TEXT,
                status     TEXT NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned', 'in_progress', 'completed', 'abandoned')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_hauler_runs_hauler_id ON catalog_api.hauler_runs (hauler_id);

            -- Prices/profit/names are all snapshotted at save time (not
            -- re-derived from live market_orders/types/solar_systems on
            -- read) -- a run is a record of a plan made against a
            -- moment-in-time market, not a live-updating view; the market
            -- has likely moved by the time a leg is actually flown, and a
            -- saved run should still read back the same either way. This
            -- also means a run never breaks if it references a type/system
            -- this service's read side later can't resolve for some reason.
            CREATE TABLE IF NOT EXISTS catalog_api.hauler_run_legs (
                run_leg_id       BIGSERIAL PRIMARY KEY,
                run_id           BIGINT NOT NULL REFERENCES catalog_api.hauler_runs (run_id) ON DELETE CASCADE,
                leg_order        INTEGER NOT NULL,
                type_id          INTEGER NOT NULL,
                type_name        TEXT NOT NULL,
                buy_system_id    INTEGER NOT NULL,
                buy_system_name  TEXT NOT NULL,
                sell_system_id   INTEGER NOT NULL,
                sell_system_name TEXT NOT NULL,
                buy_price        DOUBLE PRECISION NOT NULL,
                sell_price       DOUBLE PRECISION NOT NULL,
                quantity         BIGINT NOT NULL,
                expected_profit  DOUBLE PRECISION NOT NULL,
                completed        BOOLEAN NOT NULL DEFAULT false,
                UNIQUE (run_id, leg_order)
            );
            CREATE INDEX IF NOT EXISTS idx_hauler_run_legs_run_id ON catalog_api.hauler_run_legs (run_id);

            -- Not hauler-scoped -- a price watch is about an item, not a
            -- specific hauler's cargo, so it's a flat list like haulers
            -- itself rather than nested under one. No FK to (public-schema,
            -- sync-owned) types, same reasoning as everywhere else in this
            -- file: reads join against it live for the current name/price
            -- rather than storing a copy, so an unresolvable type_id would
            -- just drop the watch from a list, not corrupt anything.
            CREATE TABLE IF NOT EXISTS catalog_api.price_watches (
                watch_id        BIGSERIAL PRIMARY KEY,
                type_id         INTEGER NOT NULL,
                reference_price DOUBLE PRECISION NOT NULL,
                threshold_pct   DOUBLE PRECISION NOT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            ",
        )
        .await
        .context("bootstrapping catalog-api search index and app schema")?;
    Ok(())
}
