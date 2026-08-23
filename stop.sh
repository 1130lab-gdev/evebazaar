#!/usr/bin/env bash
# Stops every background process start.sh started (ordermatcher, risk,
# exchange-webapi, tgi, database, evebazaar.com), tracked via the PID
# files under .run/pids. Docker-backed eve-db/exchange-db are left
# running, same as `start.sh stop` -- they're meant to persist across dev
# sessions; use `docker compose -f <compose file> down` if you actually
# want them gone too.
#
# Thin wrapper around `start.sh stop` rather than a separate
# implementation, so there's exactly one place (start.sh) that knows how
# PIDs are tracked and how to shut a service down cleanly.
set -uo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/start.sh" stop "$@"
