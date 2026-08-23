use deadpool_postgres::Pool;

use crate::{
    domain::{Category, MarketGroup, Region, TypeDetail},
    error::AppError,
};

pub async fn list_categories(pool: &Pool) -> Result<Vec<Category>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query("SELECT category_id, name FROM categories WHERE published ORDER BY name", &[])
        .await?;
    Ok(rows.into_iter().map(|r| Category { category_id: r.get(0), name: r.get(1) }).collect())
}

pub async fn list_market_groups(pool: &Pool) -> Result<Vec<MarketGroup>, AppError> {
    let client = pool.get().await?;
    let rows = client
        .query("SELECT market_group_id, parent_group_id, name FROM market_groups ORDER BY name", &[])
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| MarketGroup { market_group_id: r.get(0), parent_group_id: r.get(1), name: r.get(2) })
        .collect())
}

pub async fn list_regions(pool: &Pool) -> Result<Vec<Region>, AppError> {
    let client = pool.get().await?;
    let rows = client.query("SELECT region_id, name FROM regions ORDER BY name", &[]).await?;
    Ok(rows.into_iter().map(|r| Region { region_id: r.get(0), name: r.get(1) }).collect())
}

pub async fn get_type(pool: &Pool, type_id: i32) -> Result<Option<TypeDetail>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "SELECT t.type_id, t.name, t.description, t.group_id, g.name,
                    g.category_id, c.name, t.market_group_id, t.volume,
                    t.packaged_volume, t.mass, t.published
             FROM types t
             JOIN groups g ON g.group_id = t.group_id
             JOIN categories c ON c.category_id = g.category_id
             WHERE t.type_id = $1",
            &[&type_id],
        )
        .await?;
    Ok(row.map(|r| TypeDetail {
        type_id: r.get(0),
        name: r.get(1),
        description: r.get(2),
        group_id: r.get(3),
        group_name: r.get(4),
        category_id: r.get(5),
        category_name: r.get(6),
        market_group_id: r.get(7),
        volume: r.get(8),
        packaged_volume: r.get(9),
        mass: r.get(10),
        published: r.get(11),
    }))
}
