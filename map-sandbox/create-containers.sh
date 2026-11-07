#!/usr/bin/env bash
# Commit running map-sandbox container to image, save as tar under
# Containers/. Run `docker compose up -d --build` first -- this commits
# whatever is currently running, it doesn't build anything.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/Containers"

docker commit map-sandbox map-sandbox:latest
docker save -o "$ROOT/Containers/map-sandbox.tar" map-sandbox:latest

echo "map-sandbox committed and image saved as tar file."
