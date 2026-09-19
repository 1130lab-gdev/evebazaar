#!/usr/bin/env bash
# Stop and remove catalog-api's container, image, and saved tar file.
#
# evebazaar-network (shared with the other services) and the eve-database
# container are left alone -- owned by database/database/docker-compose.yml,
# not this file.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker rm -f catalog-api 2>/dev/null
docker rmi -f catalog-api:latest 2>/dev/null

docker container prune -f
docker image prune -f
docker volume prune -f

rm -f "$ROOT/Containers/catalog-api.tar" 2>/dev/null

echo "catalog-api container, image, and tar file deleted."
