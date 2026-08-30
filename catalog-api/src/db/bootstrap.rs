use anyhow::{Context, Result};
use deadpool_postgres::Pool;

/// Idempotent, applied on every startup -- same posture as tgi's
/// `bootstrap_schema`. `types` / `market_orders` and their taxonomy tables
/// are owned by the `database` project's `00-startup.sql`; the indexes
/// here are purely read-path optimizations for catalog-api's own
/// `/search` and arbitrage/route-planner queries, not schema changes
/// either of those projects needs to know about. catalog-api holds no
/// state of its own any more, so there's nothing to create beyond these.
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
            ",
        )
        .await
        .context("bootstrapping catalog-api read-path indexes")?;
    Ok(())
}
