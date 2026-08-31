#!/usr/bin/env bash
# Stop and remove map-sandbox's container, image, saved tar file, and this
# project's own default network.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker rm -f map-sandbox 2>/dev/null
docker rmi -f map-sandbox:latest 2>/dev/null

docker container prune -f
docker image prune -f
docker volume prune -f

docker network rm map-sandbox_default 2>/dev/null

rm -f "$ROOT/Containers/map-sandbox.tar" 2>/dev/null

echo "map-sandbox container, image, network, and tar file deleted."
