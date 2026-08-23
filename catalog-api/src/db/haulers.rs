use deadpool_postgres::Pool;

use crate::{
    domain::{Hauler, HaulerRun, HaulerRunLeg, RunStatus},
    error::AppError,
};

pub async fn create_hauler(
    pool: &Pool,
    name: &str,
    cargo_capacity_m3: f64,
    isk_available: f64,
    route_security_profile: Option<&str>,
    home_system_id: Option<i32>,
    owner_user_id: i64,
) -> Result<Hauler, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_one(
            "INSERT INTO catalog_api.haulers (name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING hauler_id, name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id, created_at, updated_at",
            &[&name, &cargo_capacity_m3, &isk_available, &route_security_profile, &home_system_id, &owner_user_id],
        )
        .await?;
    Ok(row_to_hauler(&row))
}

/// `owner_user_id = None` lists every hauler (dispatcher/admin); `Some(uid)`
/// scopes to just that freighter's own haulers.
pub async fn list_haulers(pool: &Pool, owner_user_id: Option<i64>) -> Result<Vec<Hauler>, AppError> {
    let client = pool.get().await?;
    let rows = match owner_user_id {
        Some(uid) => {
            client
                .query(
                    "SELECT hauler_id, name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id, created_at, updated_at
                     FROM catalog_api.haulers WHERE owner_user_id = $1 ORDER BY name",
                    &[&uid],
                )
                .await?
        }
        None => {
            client
                .query(
                    "SELECT hauler_id, name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id, created_at, updated_at
                     FROM catalog_api.haulers ORDER BY name",
                    &[],
                )
                .await?
        }
    };
    Ok(rows.iter().map(row_to_hauler).collect())
}

pub async fn get_hauler(pool: &Pool, hauler_id: i64) -> Result<Option<Hauler>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "SELECT hauler_id, name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id, created_at, updated_at
             FROM catalog_api.haulers WHERE hauler_id = $1",
            &[&hauler_id],
        )
        .await?;
    Ok(row.as_ref().map(row_to_hauler))
}

/// Every field is required on update -- callers should read-modify-write
/// (fetch the current `Hauler`, change what they want, send all three
/// back), not send partial patches. Simpler contract, and this resource
/// only has a handful of real fields anyway.
pub async fn update_hauler(
    pool: &Pool,
    hauler_id: i64,
    name: &str,
    cargo_capacity_m3: f64,
    isk_available: f64,
    route_security_profile: Option<&str>,
    home_system_id: Option<i32>,
) -> Result<Option<Hauler>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "UPDATE catalog_api.haulers
             SET name = $2, cargo_capacity_m3 = $3, isk_available = $4, route_security_profile = $5, home_system_id = $6, updated_at = now()
             WHERE hauler_id = $1
             RETURNING hauler_id, name, cargo_capacity_m3, isk_available, route_security_profile, home_system_id, owner_user_id, created_at, updated_at",
            &[&hauler_id, &name, &cargo_capacity_m3, &isk_available, &route_security_profile, &home_system_id],
        )
        .await?;
    Ok(row.as_ref().map(row_to_hauler))
}

/// `ON DELETE CASCADE` on `hauler_runs`/`hauler_run_legs` takes care of a
/// hauler's saved runs -- deleting a hauler deletes its history with it,
/// no orphaned rows left behind.
pub async fn delete_hauler(pool: &Pool, hauler_id: i64) -> Result<bool, AppError> {
    let client = pool.get().await?;
    let deleted = client.execute("DELETE FROM catalog_api.haulers WHERE hauler_id = $1", &[&hauler_id]).await?;
    Ok(deleted > 0)
}

fn row_to_hauler(r: &tokio_postgres::Row) -> Hauler {
    Hauler {
        hauler_id: r.get(0),
        name: r.get(1),
        cargo_capacity_m3: r.get(2),
        isk_available: r.get(3),
        route_security_profile: r.get(4),
        home_system_id: r.get(5),
        owner_user_id: r.get(6),
        created_at: r.get(7),
        updated_at: r.get(8),
    }
}

/// Everything needed to record one leg of a run -- see
/// `HaulerRunLeg`'s doc comment for why names/prices are captured here
/// rather than joined from live tables on read.
#[derive(Debug, Clone)]
pub struct NewRunLeg {
    pub type_id: i32,
    pub type_name: String,
    pub buy_system_id: i32,
    pub buy_system_name: String,
    pub sell_system_id: i32,
    pub sell_system_name: String,
    pub buy_price: f64,
    pub sell_price: f64,
    pub quantity: i64,
    pub expected_profit: f64,
}

fn status_str(status: RunStatus) -> &'static str {
    match status {
        RunStatus::Planned => "planned",
        RunStatus::InProgress => "in_progress",
        RunStatus::Completed => "completed",
        RunStatus::Abandoned => "abandoned",
    }
}

fn parse_status(s: &str) -> RunStatus {
    match s {
        "in_progress" => RunStatus::InProgress,
        "completed" => RunStatus::Completed,
        "abandoned" => RunStatus::Abandoned,
        _ => RunStatus::Planned,
    }
}

/// Inserts the run and all of its legs in one transaction -- a run with
/// only some of its legs saved (if a later insert failed) would be a
/// silently wrong itinerary, worse than the whole save failing outright.
pub async fn create_run(pool: &Pool, hauler_id: i64, name: Option<&str>, legs: &[NewRunLeg]) -> Result<HaulerRun, AppError> {
    let mut client = pool.get().await?;
    let txn = client.transaction().await?;

    let run_row = txn
        .query_one(
            "INSERT INTO catalog_api.hauler_runs (hauler_id, name)
             VALUES ($1, $2)
             RETURNING run_id, hauler_id, name, status, created_at, updated_at",
            &[&hauler_id, &name],
        )
        .await?;
    let run_id: i64 = run_row.get(0);

    let mut saved_legs = Vec::with_capacity(legs.len());
    for (i, leg) in legs.iter().enumerate() {
        let leg_order = (i + 1) as i32;
        let leg_row = txn
            .query_one(
                "INSERT INTO catalog_api.hauler_run_legs
                     (run_id, leg_order, type_id, type_name, buy_system_id, buy_system_name,
                      sell_system_id, sell_system_name, buy_price, sell_price, quantity, expected_profit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING run_leg_id, leg_order, type_id, type_name, buy_system_id, buy_system_name,
                           sell_system_id, sell_system_name, buy_price, sell_price, quantity, expected_profit, completed",
                &[
                    &run_id,
                    &leg_order,
                    &leg.type_id,
                    &leg.type_name,
                    &leg.buy_system_id,
                    &leg.buy_system_name,
                    &leg.sell_system_id,
                    &leg.sell_system_name,
                    &leg.buy_price,
                    &leg.sell_price,
                    &leg.quantity,
                    &leg.expected_profit,
                ],
            )
            .await?;
        saved_legs.push(row_to_leg(&leg_row));
    }

    txn.commit().await?;

    Ok(HaulerRun {
        run_id,
        hauler_id: run_row.get(1),
        name: run_row.get(2),
        status: parse_status(run_row.get::<_, String>(3).as_str()),
        created_at: run_row.get(4),
        updated_at: run_row.get(5),
        legs: saved_legs,
    })
}

pub async fn list_runs_for_hauler(pool: &Pool, hauler_id: i64) -> Result<Vec<HaulerRun>, AppError> {
    let client = pool.get().await?;
    let run_rows = client
        .query(
            "SELECT run_id, hauler_id, name, status, created_at, updated_at
             FROM catalog_api.hauler_runs WHERE hauler_id = $1 ORDER BY created_at DESC",
            &[&hauler_id],
        )
        .await?;

    let mut runs = Vec::with_capacity(run_rows.len());
    for row in &run_rows {
        let run_id: i64 = row.get(0);
        let legs = fetch_legs(&client, run_id).await?;
        runs.push(row_to_run(row, legs));
    }
    Ok(runs)
}

pub async fn get_run(pool: &Pool, run_id: i64) -> Result<Option<HaulerRun>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "SELECT run_id, hauler_id, name, status, created_at, updated_at
             FROM catalog_api.hauler_runs WHERE run_id = $1",
            &[&run_id],
        )
        .await?;
    let Some(row) = row else { return Ok(None) };
    let legs = fetch_legs(&client, run_id).await?;
    Ok(Some(row_to_run(&row, legs)))
}

async fn fetch_legs(client: &deadpool_postgres::Client, run_id: i64) -> Result<Vec<HaulerRunLeg>, AppError> {
    let rows = client
        .query(
            "SELECT run_leg_id, leg_order, type_id, type_name, buy_system_id, buy_system_name,
                    sell_system_id, sell_system_name, buy_price, sell_price, quantity, expected_profit, completed
             FROM catalog_api.hauler_run_legs WHERE run_id = $1 ORDER BY leg_order",
            &[&run_id],
        )
        .await?;
    Ok(rows.iter().map(row_to_leg).collect())
}

pub async fn update_run_status(pool: &Pool, run_id: i64, status: RunStatus) -> Result<Option<HaulerRun>, AppError> {
    let client = pool.get().await?;
    let row = client
        .query_opt(
            "UPDATE catalog_api.hauler_runs SET status = $2, updated_at = now()
             WHERE run_id = $1
             RETURNING run_id, hauler_id, name, status, created_at, updated_at",
            &[&run_id, &status_str(status)],
        )
        .await?;
    let Some(row) = row else { return Ok(None) };
    let legs = fetch_legs(&client, run_id).await?;
    Ok(Some(row_to_run(&row, legs)))
}

/// Returns `false` if `run_leg_id` doesn't exist, so the route handler can
/// tell "nothing to update" apart from a real failure.
pub async fn set_leg_completed(pool: &Pool, run_leg_id: i64, completed: bool) -> Result<bool, AppError> {
    let client = pool.get().await?;
    let updated = client
        .execute(
            "UPDATE catalog_api.hauler_run_legs SET completed = $2 WHERE run_leg_id = $1",
            &[&run_leg_id, &completed],
        )
        .await?;
    Ok(updated > 0)
}

pub async fn delete_run(pool: &Pool, run_id: i64) -> Result<bool, AppError> {
    let client = pool.get().await?;
    let deleted = client.execute("DELETE FROM catalog_api.hauler_runs WHERE run_id = $1", &[&run_id]).await?;
    Ok(deleted > 0)
}

fn row_to_run(r: &tokio_postgres::Row, legs: Vec<HaulerRunLeg>) -> HaulerRun {
    HaulerRun {
        run_id: r.get(0),
        hauler_id: r.get(1),
        name: r.get(2),
        status: parse_status(r.get::<_, String>(3).as_str()),
        created_at: r.get(4),
        updated_at: r.get(5),
        legs,
    }
}

fn row_to_leg(r: &tokio_postgres::Row) -> HaulerRunLeg {
    HaulerRunLeg {
        run_leg_id: r.get(0),
        leg_order: r.get(1),
        type_id: r.get(2),
        type_name: r.get(3),
        buy_system_id: r.get(4),
        buy_system_name: r.get(5),
        sell_system_id: r.get(6),
        sell_system_name: r.get(7),
        buy_price: r.get(8),
        sell_price: r.get(9),
        quantity: r.get(10),
        expected_profit: r.get(11),
        completed: r.get(12),
    }
}
