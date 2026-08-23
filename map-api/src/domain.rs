use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Region {
    pub region_id: i32,
    pub name: String,
    /// Lore/flavor text from ESI, where synced -- not every region has one (70/114 as of this writing).
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Constellation {
    pub constellation_id: i32,
    pub region_id: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SystemSummary {
    pub system_id: i32,
    pub constellation_id: i32,
    pub region_id: i32,
    pub name: String,
    pub security_status: f64,
    /// Galactic coordinates, meters. Light-year scale between systems --
    /// this is the frame `jump_distance_ly` on `Stargate` is computed in,
    /// not the frame a stargate's own position is in.
    pub position_x: f64,
    pub position_y: f64,
    pub position_z: f64,
}

/// A directed jump edge: this specific gate, in `system_id`, leads to
/// `destination_stargate_id` in `destination_system_id`. Deliberately not
/// deduplicated into an undirected "connection" -- a round trip is two
/// distinct stargates (one on each end), and a future router needs the
/// specific departure gate's identity to cost the in-system leg to it via
/// `StargateDistance`.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Stargate {
    pub stargate_id: i32,
    pub system_id: i32,
    pub system_name: String,
    pub region_id: i32,
    pub destination_stargate_id: i32,
    pub destination_system_id: i32,
    pub destination_system_name: String,
    pub destination_region_id: i32,
    /// Straight-line distance between the two systems' own galactic
    /// positions, in light-years -- not the stargates' own positions
    /// (planetary scale, negligible here).
    pub jump_distance_ly: f64,
}

/// Distance between two stargates within the *same* system, using their own
/// in-system `position_x/y/z` (planetary/AU scale, meters) -- what a router
/// needs to cost travel from an arrival gate to the next departure gate.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct StargateDistance {
    pub stargate_id_a: i32,
    pub stargate_id_b: i32,
    pub distance_m: f64,
}

/// Ship/pod/NPC kills and ship jumps in the last hour, per ESI's own
/// snapshot cadence. Display-only -- never factors into route cost.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SystemActivity {
    pub system_id: i32,
    pub ship_kills: i32,
    pub npc_kills: i32,
    pub pod_kills: i32,
    pub ship_jumps: i32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct Station {
    pub station_id: i32,
    pub name: String,
}

/// One system on a computed route, in visiting order, bundling everything
/// "pertinent to traveling through" it: identity/grouping, security,
/// current activity, and docking options.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RouteSystem {
    pub system_id: i32,
    pub name: String,
    pub constellation_id: i32,
    pub region_id: i32,
    pub region_name: String,
    pub security_status: f64,
    pub ship_kills: i32,
    pub npc_kills: i32,
    pub pod_kills: i32,
    pub ship_jumps: i32,
    pub stations: Vec<Station>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum RouteLegKind {
    /// Crossing from one system to another through a stargate pair.
    Jump,
    /// In-system travel from one stargate to another.
    Warp,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RouteLeg {
    pub kind: RouteLegKind,
    pub from_stargate_id: i32,
    pub from_system_id: i32,
    pub to_stargate_id: i32,
    pub to_system_id: i32,
    pub time_s: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RouteResponse {
    pub total_time_s: f64,
    pub total_jumps: u32,
    pub systems: Vec<RouteSystem>,
    pub legs: Vec<RouteLeg>,
}
