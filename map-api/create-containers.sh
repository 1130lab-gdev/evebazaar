#!/usr/bin/env bash
# Commit running map-api container to image, save as tar under Containers/.
# Run `docker compose up -d --build` first -- this commits whatever is
# currently running, it doesn't build anything.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/Containers"

docker commit map-api map-api:latest
docker save -o "$ROOT/Containers/map-api.tar" map-api:latest

echo "map-api committed and image saved as tar file."
