use deadpool_postgres::Pool;

use crate::{domain::SearchResult, error::AppError};

/// Stage-1 retrieval: pg_trgm similarity search over `types.name`. This is
/// the entire ranking pipeline for now -- a future reranker slots in behind
/// this same query (widen `limit` to pull more candidates, rerank, then
/// truncate) without changing the `/search` response shape callers see.
pub async fn search_types(pool: &Pool, query: &str, limit: i64) -> Result<Vec<SearchResult>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query(
            "SELECT type_id, name, group_id, market_group_id, similarity(name, $1) AS score
             FROM types
             WHERE published AND name % $1
             ORDER BY score DESC
             LIMIT $2",
            &[&query, &limit],
        )
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| SearchResult {
            type_id: r.get(0),
            name: r.get(1),
            group_id: r.get(2),
            market_group_id: r.get(3),
            score: r.get(4),
        })
        .collect())
}
