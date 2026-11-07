#!/usr/bin/env bash
# Brings up the evebazaar stack in dependency order:
#   eve-db (docker)
#     -> database (one-time full sync, then a --mode mktdata loop)
#     -> catalog-api, map-api (read-only against eve-db)
#       -> evebazaar.com (vite dev server)
#
# This is a public, no-login site -- catalog-api and map-api have no auth,
# no accounts, and no dependency on any exchange/order-matching service.
#
# Safe to re-run: anything already up and healthy is left alone. deadpool-
# backed Postgres access reconnects lazily on its own, so there's nothing
# worth force-restarting for a dependency coming back up.
#
# Usage: ./start.sh [start|status|stop]

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
PID_DIR="$RUN_DIR/pids"
LOG_DIR="$RUN_DIR/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

EVE_DB_CONTAINER=evebazaar-database
EVE_DB_COMPOSE="$ROOT/database/database/docker-compose.yml"
EVE_DB_PORT=5532

CATALOG_API_PORT=8091
MAP_API_PORT=8092
FRONTEND_PORT=5173

log() { printf '[%s] %s\n' "$1" "$2"; }

# Some machines (this one included) don't have the invoking user in the
# `docker` group, so plain `docker` gets a permission-denied on the socket
# and every docker call needs `sudo` in front of it. Detected lazily (only
# by the docker-touching functions below, not unconditionally at load time)
# so that e.g. stopping local processes doesn't print an irrelevant docker
# warning. A `sudo` fallback can still prompt for a password interactively,
# which is fine for a manually-run script but means this doesn't work
# unattended until the user is actually in the `docker` group.
DOCKER=()
detect_docker() {
    [ ${#DOCKER[@]} -gt 0 ] && return
    DOCKER=(docker)
    if ! docker info >/dev/null 2>&1; then
        DOCKER=(sudo docker)
        log note "docker isn't usable as $(whoami) without sudo -- falling back to 'sudo docker' (may prompt for your password). Run 'sudo usermod -aG docker $(whoami)' and re-login to fix this permanently."
    fi
}

# ---------------------------------------------------------------------------
# Generic process helpers
# ---------------------------------------------------------------------------

# Dev servers on this machine happily bind IPv6-loopback only (vite's
# default "localhost" bind resolves to ::1 here, not 127.0.0.1) -- checking
# only one family silently misses those, so both are tried.
is_tcp_open() {
    local port="$1"
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && { exec 3>&- 2>/dev/null; return 0; }
    (exec 3<>"/dev/tcp/::1/$port") 2>/dev/null && { exec 3>&- 2>/dev/null; return 0; }
    return 1
}

wait_for_tcp() {
    local port="$1" timeout="${2:-30}"
    local waited=0
    while ! is_tcp_open "$port"; do
        sleep 1
        waited=$((waited + 1))
        [ "$waited" -ge "$timeout" ] && return 1
    done
    return 0
}

pid_file_alive() {
    local name="$1"
    local pid_file="$PID_DIR/$name.pid"
    [ -f "$pid_file" ] || return 1
    local pid
    pid=$(cat "$pid_file")
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Echoes "managed <pid>" | "external" | "down" for a port-bound service.
# "external" matters in practice: something can already be listening on a
# service's port without this script having started it (a manually-run
# `cargo run`, a leftover process from before this script existed, etc).
# Port liveness is treated as authoritative over our own pid file, so we
# never try to double-bind a port a pid-file check alone would have missed.
service_state() {
    local name="$1" port="$2"
    if is_tcp_open "$port"; then
        if pid_file_alive "$name"; then
            echo "managed $(cat "$PID_DIR/$name.pid")"
        else
            echo "external"
        fi
    else
        echo "down"
    fi
}

# Backgrounds "$@" with cwd "$workdir", capturing the *actual* binary's PID
# (not a `cargo run`/`npm` wrapper's) by exec-ing inside the backgrounded
# subshell -- exec replaces the subshell's process image instead of forking
# a child, so `$!` is already the real process and `kill` on it works
# directly with no orphaned wrapper left behind.
start_bg() {
    local name="$1" workdir="$2"; shift 2
    {
        echo "===== $(date -Is) starting $name ====="
    } >>"$LOG_DIR/$name.log"
    (cd "$workdir" && exec "$@") >>"$LOG_DIR/$name.log" 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null || true
    echo "$pid" >"$PID_DIR/$name.pid"
}

stop_service() {
    local name="$1"
    pid_file_alive "$name" || { rm -f "$PID_DIR/$name.pid"; return 0; }
    local pid
    pid=$(cat "$PID_DIR/$name.pid")
    log stop "$name (pid $pid)"
    kill "$pid" 2>/dev/null
    for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
    done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    rm -f "$PID_DIR/$name.pid"
}

build_rust() {
    local project="$1"
    log build "$project"
    if ! (cd "$ROOT/$project" && cargo build --quiet) >>"$LOG_DIR/$project-build.log" 2>&1; then
        log fail "$project failed to build -- see $LOG_DIR/$project-build.log"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Docker-backed Postgres
# ---------------------------------------------------------------------------

docker_health() {
    detect_docker
    "${DOCKER[@]}" inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null
}

ensure_postgres() {
    local label="$1" container="$2" compose_file="$3" port="$4"
    if [ "$(docker_health "$container")" = "healthy" ]; then
        log skip "$label already up and healthy (container $container, port $port)"
        return 0
    fi
    log start "$label (docker compose, container $container)"
    if ! "${DOCKER[@]}" compose -f "$compose_file" up -d >>"$LOG_DIR/$label.log" 2>&1; then
        log fail "$label failed to start -- see $LOG_DIR/$label.log (if it mentions the docker socket, this is the sudo/docker-group issue noted above)"
        return 1
    fi
    local waited=0
    while [ "$(docker_health "$container")" != "healthy" ]; do
        sleep 1
        waited=$((waited + 1))
        if [ "$waited" -ge 30 ]; then
            log fail "$label never became healthy within 30s"
            return 1
        fi
    done
    log ok "$label healthy"
}

# ---------------------------------------------------------------------------
# database: needs at least one full sync (taxonomy+universe+market) before
# a --mode mktdata loop is useful -- mktdata only syncs orders for regions
# that already exist, so on a genuinely empty eve DB it would loop forever
# doing nothing. Detected via the `regions` table (always present, created
# by the DB's own init SQL on first container boot regardless of whether
# database has ever run).
# ---------------------------------------------------------------------------

ensure_database() {
    build_rust database || return 1
    detect_docker

    local region_count
    region_count=$("${DOCKER[@]}" exec "$EVE_DB_CONTAINER" psql -U eve -d eve -tAc "SELECT COUNT(*) FROM regions" 2>/dev/null || echo "")
    if [ -z "$region_count" ] || [ "$region_count" -eq 0 ]; then
        log start "database: eve DB is empty, running one-time full sync (talks to live ESI, can take a while)"
        if ! (cd "$ROOT/database" && ./target/debug/database --mode sync) 2>&1 | tee "$LOG_DIR/database-initial-sync.log"; then
            log fail "database: initial full sync failed -- see $LOG_DIR/database-initial-sync.log"
            return 1
        fi
        log ok "database: initial full sync complete"
    fi

    if pid_file_alive database; then
        log skip "database mktdata loop already running (pid $(cat "$PID_DIR/database.pid"))"
        return 0
    fi
    log start "database (--mode mktdata loop)"
    start_bg database "$ROOT/database" ./target/debug/database --mode mktdata
}

ensure_catalog_api() {
    build_rust catalog-api || return 1
    local state; state=$(service_state catalog-api "$CATALOG_API_PORT")
    case "$state" in
        managed*)
            log skip "catalog-api already running (pid ${state#managed })"
            return 0
            ;;
        external)
            log skip "something is already listening on $CATALOG_API_PORT (not started by this script) -- leaving it alone"
            return 0
            ;;
    esac
    log start "catalog-api"
    start_bg catalog-api "$ROOT/catalog-api" ./target/debug/catalog-api
    if ! wait_for_tcp "$CATALOG_API_PORT" 20; then
        log fail "catalog-api didn't open port $CATALOG_API_PORT within 20s -- see $LOG_DIR/catalog-api.log"
        return 1
    fi
    log ok "catalog-api listening on $CATALOG_API_PORT"
}

ensure_map_api() {
    build_rust map-api || return 1
    local state; state=$(service_state map-api "$MAP_API_PORT")
    case "$state" in
        managed*)
            log skip "map-api already running (pid ${state#managed })"
            return 0
            ;;
        external)
            log skip "something is already listening on $MAP_API_PORT (not started by this script) -- leaving it alone"
            return 0
            ;;
    esac
    log start "map-api"
    start_bg map-api "$ROOT/map-api" ./target/debug/map-api
    if ! wait_for_tcp "$MAP_API_PORT" 20; then
        log fail "map-api didn't open port $MAP_API_PORT within 20s -- see $LOG_DIR/map-api.log"
        return 1
    fi
    log ok "map-api listening on $MAP_API_PORT"
}

ensure_frontend() {
    if [ ! -d "$ROOT/evebazaar.com/node_modules" ]; then
        log start "evebazaar.com: node_modules missing, running npm install"
        if ! (cd "$ROOT/evebazaar.com" && npm install) >>"$LOG_DIR/evebazaar.com-install.log" 2>&1; then
            log fail "evebazaar.com: npm install failed -- see $LOG_DIR/evebazaar.com-install.log"
            return 1
        fi
    fi
    local state; state=$(service_state evebazaar.com "$FRONTEND_PORT")
    case "$state" in
        managed*)
            log skip "evebazaar.com already running (pid ${state#managed })"
            return 0
            ;;
        external)
            log skip "something is already listening on $FRONTEND_PORT (not started by this script) -- leaving it alone"
            return 0
            ;;
    esac
    log start "evebazaar.com (vite dev server)"
    start_bg evebazaar.com "$ROOT/evebazaar.com" npm run dev -- --port "$FRONTEND_PORT"
    if ! wait_for_tcp "$FRONTEND_PORT" 20; then
        log fail "evebazaar.com didn't open port $FRONTEND_PORT within 20s -- see $LOG_DIR/evebazaar.com.log"
        return 1
    fi
    log ok "evebazaar.com listening on $FRONTEND_PORT"
}

# ---------------------------------------------------------------------------
# Status / stop
# ---------------------------------------------------------------------------

print_status() {
    printf '\n%-18s %-10s %-8s %s\n' SERVICE STATE PID PORT
    local eve_state=down
    [ "$(docker_health "$EVE_DB_CONTAINER")" = "healthy" ] && eve_state=up
    printf '%-18s %-10s %-8s %s\n' eve-db "$eve_state" - "$EVE_DB_PORT"

    local name port
    for name in database catalog-api map-api evebazaar.com; do
        case "$name" in
            catalog-api) port=$CATALOG_API_PORT ;;
            map-api) port=$MAP_API_PORT ;;
            evebazaar.com) port=$FRONTEND_PORT ;;
            *) port=- ;;
        esac
        if [ "$port" != - ]; then
            local state; state=$(service_state "$name" "$port")
            case "$state" in
                managed*) printf '%-18s %-10s %-8s %s\n' "$name" up "${state#managed }" "$port" ;;
                external) printf '%-18s %-10s %-8s %s\n' "$name" "up (external)" - "$port" ;;
                *) printf '%-18s %-10s %-8s %s\n' "$name" down - "$port" ;;
            esac
        elif pid_file_alive "$name"; then
            printf '%-18s %-10s %-8s %s\n' "$name" up "$(cat "$PID_DIR/$name.pid")" "$port"
        else
            printf '%-18s %-10s %-8s %s\n' "$name" down - "$port"
        fi
    done
    echo
    echo "logs: $LOG_DIR/<service>.log"
}

stop_all() {
    local name
    for name in evebazaar.com catalog-api map-api database; do
        stop_service "$name"
    done
    log note "eve-db (docker) left running -- 'docker compose -f $EVE_DB_COMPOSE down' to stop it"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

start_all() {
    local failed=0
    ensure_postgres eve-db "$EVE_DB_CONTAINER" "$EVE_DB_COMPOSE" "$EVE_DB_PORT" || failed=1
    ensure_database || failed=1
    ensure_catalog_api || failed=1
    ensure_map_api || failed=1
    ensure_frontend || failed=1
    print_status
    if [ "$failed" -ne 0 ]; then
        log fail "one or more services failed to start -- see the [fail] lines and their logs above"
        exit 1
    fi
}

case "${1:-start}" in
    start) start_all ;;
    status) print_status ;;
    stop) stop_all ;;
    *)
        echo "usage: $0 [start|status|stop]" >&2
        exit 2
        ;;
esac
