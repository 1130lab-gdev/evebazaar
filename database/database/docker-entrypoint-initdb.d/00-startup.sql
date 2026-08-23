-- EVE ESI market/universe schema
--
-- Layout mirrors ESI's own dependency order so this file can run top-to-bottom:
--   1. item taxonomy (categories -> groups -> market_groups -> types)
--   2. universe hierarchy (regions -> constellations -> solar_systems -> stargates/stations)
--   3. market data (current-state orders + ESI's own daily history)
--
-- All primary keys use ESI's own ids (no surrogate keys) so upserts are a
-- straight `INSERT ... ON CONFLICT (id) DO UPDATE` from the API response.
-- Reverse relations (region.constellations, system.stargates, etc.) are not
-- stored as arrays -- they're derived by querying the FK side.

-- ========================================================================
-- Item taxonomy
-- ========================================================================

CREATE TABLE categories (
    category_id INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    published   BOOLEAN NOT NULL
);

CREATE TABLE groups (
    group_id    INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories (category_id),
    name        TEXT NOT NULL,
    published   BOOLEAN NOT NULL
);
CREATE INDEX idx_groups_category_id ON groups (category_id);

-- Self-referencing tree (matches ESI's market group hierarchy).
CREATE TABLE market_groups (
    market_group_id INTEGER PRIMARY KEY,
    parent_group_id INTEGER REFERENCES market_groups (market_group_id),
    name             TEXT NOT NULL,
    description      TEXT
);
CREATE INDEX idx_market_groups_parent_group_id ON market_groups (parent_group_id);

CREATE TABLE types (
    type_id          INTEGER PRIMARY KEY,
    group_id         INTEGER NOT NULL REFERENCES groups (group_id),
    market_group_id  INTEGER REFERENCES market_groups (market_group_id),
    name             TEXT NOT NULL,
    description      TEXT NOT NULL,
    mass             DOUBLE PRECISION,
    volume           DOUBLE PRECISION,
    packaged_volume  DOUBLE PRECISION,
    capacity         DOUBLE PRECISION,
    portion_size     INTEGER,
    radius           DOUBLE PRECISION,
    published        BOOLEAN NOT NULL,
    icon_id          INTEGER,
    graphic_id       INTEGER
);
CREATE INDEX idx_types_group_id ON types (group_id);
CREATE INDEX idx_types_market_group_id ON types (market_group_id);

-- ========================================================================
-- Universe hierarchy
-- ========================================================================

CREATE TABLE regions (
    region_id   INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE constellations (
    constellation_id INTEGER PRIMARY KEY,
    region_id         INTEGER NOT NULL REFERENCES regions (region_id),
    name              TEXT NOT NULL,
    position_x        DOUBLE PRECISION NOT NULL,
    position_y        DOUBLE PRECISION NOT NULL,
    position_z        DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_constellations_region_id ON constellations (region_id);

CREATE TABLE solar_systems (
    system_id         INTEGER PRIMARY KEY,
    constellation_id  INTEGER NOT NULL REFERENCES constellations (constellation_id),
    -- Denormalized from constellations.region_id: routing/market queries
    -- filter by region constantly and shouldn't need a two-hop join to get there.
    region_id         INTEGER NOT NULL REFERENCES regions (region_id),
    name              TEXT NOT NULL,
    security_status   DOUBLE PRECISION NOT NULL,
    security_class    TEXT,
    star_id           INTEGER,
    position_x        DOUBLE PRECISION NOT NULL,
    position_y        DOUBLE PRECISION NOT NULL,
    position_z        DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_solar_systems_constellation_id ON solar_systems (constellation_id);
CREATE INDEX idx_solar_systems_region_id ON solar_systems (region_id);

-- One row per gate. Each gate names its paired gate/system on the other
-- end, so a system-to-system jump graph is just this table read as edges
-- (system_id -> destination_system_id); no separate adjacency table needed.
-- destination_stargate_id is intentionally not a FK: the paired gate is
-- inserted in the same batch and there's no ordering guarantee between the
-- two rows, and destination_system_id is all routing actually needs.
CREATE TABLE stargates (
    stargate_id           INTEGER PRIMARY KEY,
    system_id             INTEGER NOT NULL REFERENCES solar_systems (system_id),
    type_id               INTEGER NOT NULL REFERENCES types (type_id),
    name                  TEXT NOT NULL,
    destination_stargate_id INTEGER NOT NULL,
    destination_system_id   INTEGER NOT NULL REFERENCES solar_systems (system_id),
    position_x            DOUBLE PRECISION NOT NULL,
    position_y            DOUBLE PRECISION NOT NULL,
    position_z            DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_stargates_system_id ON stargates (system_id);
CREATE INDEX idx_stargates_destination_system_id ON stargates (destination_system_id);

CREATE TABLE stations (
    station_id                 INTEGER PRIMARY KEY,
    system_id                  INTEGER NOT NULL REFERENCES solar_systems (system_id),
    type_id                    INTEGER NOT NULL REFERENCES types (type_id),
    name                       TEXT NOT NULL,
    owner_id                   INTEGER,
    race_id                    INTEGER,
    reprocessing_efficiency    DOUBLE PRECISION NOT NULL,
    reprocessing_stations_take DOUBLE PRECISION NOT NULL,
    max_dockable_ship_volume   DOUBLE PRECISION NOT NULL,
    office_rental_cost         DOUBLE PRECISION NOT NULL,
    services                   TEXT[] NOT NULL DEFAULT '{}',
    position_x                 DOUBLE PRECISION NOT NULL,
    position_y                 DOUBLE PRECISION NOT NULL,
    position_z                 DOUBLE PRECISION NOT NULL
);
CREATE INDEX idx_stations_system_id ON stations (system_id);

-- ========================================================================
-- Market data
-- ========================================================================

-- Current-state order book: one row per live order_id. A poll of a region
-- upserts every order it sees (bumping last_seen) and then deletes any row
-- for that region with a stale last_seen -- those orders were filled,
-- cancelled, or expired since the last poll.
--
-- location_id has no FK: it identifies either an NPC station (stations.station_id)
-- or a player structure we don't model yet. Join to stations where possible;
-- treat a miss as "structure, not tracked."
CREATE TABLE market_orders (
    order_id       BIGINT PRIMARY KEY,
    region_id      INTEGER NOT NULL REFERENCES regions (region_id),
    system_id      INTEGER NOT NULL REFERENCES solar_systems (system_id),
    type_id        INTEGER NOT NULL REFERENCES types (type_id),
    location_id    BIGINT NOT NULL,
    is_buy_order   BOOLEAN NOT NULL,
    -- DOUBLE PRECISION, not NUMERIC: ESI reports price as a JSON float, so
    -- NUMERIC would only add false precision tokio-postgres can't bind anyway.
    price          DOUBLE PRECISION NOT NULL,
    volume_remain  INTEGER NOT NULL,
    volume_total   INTEGER NOT NULL,
    min_volume     INTEGER NOT NULL,
    duration       INTEGER NOT NULL,
    issued         TIMESTAMPTZ NOT NULL,
    range          TEXT NOT NULL,
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Primary access patterns: "orders for a type in a region" (routing/arbitrage
-- comparisons across regions) and "orders at a location" (station lookups).
CREATE INDEX idx_market_orders_region_type ON market_orders (region_id, type_id);
CREATE INDEX idx_market_orders_type_id ON market_orders (type_id);
CREATE INDEX idx_market_orders_location_id ON market_orders (location_id);

-- ESI's own daily aggregates (get_markets_region_id_history) -- no need to
-- derive trend data ourselves from order snapshots.
CREATE TABLE market_history (
    region_id   INTEGER NOT NULL REFERENCES regions (region_id),
    type_id     INTEGER NOT NULL REFERENCES types (type_id),
    date        DATE NOT NULL,
    average     NUMERIC(20, 2) NOT NULL,
    highest     NUMERIC(20, 2) NOT NULL,
    lowest      NUMERIC(20, 2) NOT NULL,
    order_count BIGINT NOT NULL,
    volume      BIGINT NOT NULL,
    PRIMARY KEY (region_id, type_id, date)
);
