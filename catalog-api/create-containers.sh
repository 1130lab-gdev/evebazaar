#!/usr/bin/env bash
# Commit running catalog-api container to image, save as tar under
# Containers/. Run `docker compose up -d --build` first -- this commits
# whatever is currently running, it doesn't build anything.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$ROOT/Containers"

docker commit catalog-api catalog-api:latest
docker save -o "$ROOT/Containers/catalog-api.tar" catalog-api:latest

echo "catalog-api committed and image saved as tar file."
