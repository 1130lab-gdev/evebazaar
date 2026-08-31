#!/usr/bin/env bash
# Stop and remove the database (sync) container, image, and saved tar file.
#
# eve-db_default (the Postgres network) and the eve-database container are
# left alone -- owned by database/database/docker-compose.yml, not this file.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker rm -f database 2>/dev/null
docker rmi -f database:latest 2>/dev/null

docker container prune -f
docker image prune -f
docker volume prune -f

rm -f "$ROOT/Containers/database.tar" 2>/dev/null

echo "database container, image, and tar file deleted."
