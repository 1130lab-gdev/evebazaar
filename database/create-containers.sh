#!/usr/bin/env bash
# Commit running database (sync) container to image, save as tar under
# Containers/. Run `docker compose up -d --build` first -- this commits
# whatever is currently running, it doesn't build anything.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/Containers"

docker commit database database:latest
docker save -o "$ROOT/Containers/database.tar" database:latest

echo "database committed and image saved as tar file."
