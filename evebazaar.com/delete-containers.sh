#!/usr/bin/env bash
# Stop and remove evebazaar's container, image, saved tar file, and this
# project's own default network.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker rm -f evebazaar 2>/dev/null
docker rmi -f evebazaar:latest 2>/dev/null

docker container prune -f
docker image prune -f
docker volume prune -f

docker network rm evebazaar_default 2>/dev/null

rm -f "$ROOT/Containers/evebazaar.tar" 2>/dev/null

echo "evebazaar container, image, network, and tar file deleted."
