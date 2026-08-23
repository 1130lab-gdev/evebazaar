use anyhow::Result;
use rfesi::groups::{CategoriesCategory, Group, MarketGroupInfo, Type};
use tokio_postgres::Client;

pub async fn upsert_category(client: &Client, category: &CategoriesCategory) -> Result<()> {
    client
        .execute(
            "INSERT INTO categories (category_id, name, published)
             VALUES ($1, $2, $3)
             ON CONFLICT (category_id) DO UPDATE SET
                name = EXCLUDED.name,
                published = EXCLUDED.published",
            &[&category.category_id, &category.name, &category.published],
        )
        .await?;
    Ok(())
}

pub async fn upsert_group(client: &Client, group: &Group) -> Result<()> {
    client
        .execute(
            "INSERT INTO groups (group_id, category_id, name, published)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (group_id) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                published = EXCLUDED.published",
            &[
                &group.group_id,
                &group.category_id,
                &group.name,
                &group.published,
            ],
        )
        .await?;
    Ok(())
}

pub async fn upsert_market_group(client: &Client, market_group: &MarketGroupInfo) -> Result<()> {
    client
        .execute(
            "INSERT INTO market_groups (market_group_id, parent_group_id, name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (market_group_id) DO UPDATE SET
                parent_group_id = EXCLUDED.parent_group_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description",
            &[
                &market_group.market_group_id,
                &market_group.parent_group_id,
                &market_group.name,
                &market_group.description,
            ],
        )
        .await?;
    Ok(())
}

pub async fn upsert_type(client: &Client, item_type: &Type) -> Result<()> {
    client
        .execute(
            "INSERT INTO types (
                type_id, group_id, market_group_id, name, description,
                mass, volume, packaged_volume, capacity, portion_size,
                radius, published, icon_id, graphic_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (type_id) DO UPDATE SET
                group_id = EXCLUDED.group_id,
                market_group_id = EXCLUDED.market_group_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                mass = EXCLUDED.mass,
                volume = EXCLUDED.volume,
                packaged_volume = EXCLUDED.packaged_volume,
                capacity = EXCLUDED.capacity,
                portion_size = EXCLUDED.portion_size,
                radius = EXCLUDED.radius,
                published = EXCLUDED.published,
                icon_id = EXCLUDED.icon_id,
                graphic_id = EXCLUDED.graphic_id",
            &[
                &item_type.type_id,
                &item_type.group_id,
                &item_type.market_group_id,
                &item_type.name,
                &item_type.description,
                &item_type.mass,
                &item_type.volume,
                &item_type.packaged_volume,
                &item_type.capacity,
                &item_type.portion_size,
                &item_type.radius,
                &item_type.published,
                &item_type.icon_id,
                &item_type.graphic_id,
            ],
        )
        .await?;
    Ok(())
}

pub async fn type_exists(client: &Client, type_id: i32) -> Result<bool> {
    let row = client
        .query_opt("SELECT 1 FROM types WHERE type_id = $1", &[&type_id])
        .await?;
    Ok(row.is_some())
}
