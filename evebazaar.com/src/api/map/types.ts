// Wire types for map-api, transcribed 1:1 from map-api/src/domain.rs.
// Keep in sync by hand -- there's no shared schema generation between the
// two projects yet (see map-api's /api-docs/openapi.json for the source of
// truth if this drifts).

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

export interface Region {
  region_id: number;
  name: string;
  /** Lore/flavor text from ESI, where synced -- not every region has one. */
  description: string | null;
}

export interface Constellation {
  constellation_id: number;
  region_id: number;
  name: string;
}

export interface SystemSummary {
  system_id: number;
  constellation_id: number;
  region_id: number;
  name: string;
  security_status: number;
  /** Galactic coordinates, meters. Light-year scale between systems. */
  position_x: number;
  position_y: number;
  position_z: number;
}

/**
 * A directed jump edge: this specific gate, in `system_id`, leads to
 * `destination_stargate_id` in `destination_system_id`. Not deduplicated
 * into an undirected "connection" -- a round trip is two distinct
 * stargates, one on each end.
 */
export interface Stargate {
  stargate_id: number;
  system_id: number;
  system_name: string;
  region_id: number;
  destination_stargate_id: number;
  destination_system_id: number;
  destination_system_name: string;
  destination_region_id: number;
  /** Straight-line distance between the two systems' galactic positions, light-years. */
  jump_distance_ly: number;
}

/** Distance between two stargates within the same system, meters. */
export interface StargateDistance {
  stargate_id_a: number;
  stargate_id_b: number;
  distance_m: number;
}

/** Ship/pod/NPC kills and ship jumps in the last hour, per ESI's snapshot cadence. */
export interface SystemActivity {
  system_id: number;
  ship_kills: number;
  npc_kills: number;
  pod_kills: number;
  ship_jumps: number;
}

export interface Station {
  station_id: number;
  name: string;
}

export interface RouteSystem {
  system_id: number;
  name: string;
  constellation_id: number;
  region_id: number;
  region_name: string;
  security_status: number;
  ship_kills: number;
  npc_kills: number;
  pod_kills: number;
  ship_jumps: number;
  stations: Station[];
}

export type RouteLegKind = 'jump' | 'warp';

export interface RouteLeg {
  kind: RouteLegKind;
  from_stargate_id: number;
  from_system_id: number;
  to_stargate_id: number;
  to_system_id: number;
  time_s: number;
}

export interface RouteResponse {
  total_time_s: number;
  total_jumps: number;
  systems: RouteSystem[];
  legs: RouteLeg[];
}

/** One of `fastest` (default), `high_sec_only`, `low_sec_plus` -- see map-api's RouteParams doc comment. */
export type RouteProfile = 'fastest' | 'high_sec_only' | 'low_sec_plus';

export interface RouteParams {
  source_system_id: number;
  target_system_id: number;
  warp_speed_au_s?: number;
  profile?: RouteProfile;
  highsec_mult?: number;
  lowsec_mult?: number;
  nullsec_mult?: number;
  /** System ids the route must not pass through. The source system is
   * exempt -- see map-api's Graph::find_route doc comment. */
  avoid_system_id?: number[];
}
