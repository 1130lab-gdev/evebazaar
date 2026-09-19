# Deploying the evebazaar.com backend to the VPS

The VPS never gets the source tree. It gets, per service:

- that service's `docker-compose.yml` (in a folder of the same name)
- that service's `.env`
- the built image (pulled from a registry, or loaded from a tar) -- except
  Postgres, which is the stock `postgres:16-alpine` image straight from
  Docker Hub, plus its `docker-entrypoint-initdb.d/` folder bind-mounted in

Four stacks, started independently, sharing one bridge network:

| folder | stack | container | host port |
|---|---|---|---|
| `database/database/` | Postgres + ESI schema | `eve-database` | 127.0.0.1:5532 |
| `database/` | ESI sync | `database` | — |
| `catalog-api/` | read-only API | `catalog-api` | 127.0.0.1:8091 |
| `map-api/` | read-only API | `map-api` | 127.0.0.1:8092 |

They find each other over the external `evebazaar-network` bridge by
container name. Postgres is `eve-database` (or `db`) on it. API host ports
bind to `127.0.0.1` — a TLS reverse proxy goes in front. The frontend is
deployed separately.

`map-sandbox/` and `evebazaar.com/` are not part of this.

## 1. Build and publish images (build machine, has the source)

`rfesi/` must be checked out at the repo root (`git clone
https://github.com/mccabe93/rfesi`). Then, with your registry host in
`REGISTRY`:

```bash
export REGISTRY=registry.example.com   # your private registry
export TAG=$(git rev-parse --short HEAD)

for d in database catalog-api map-api; do
  docker compose -f "$d/docker-compose.yml" build
  docker compose -f "$d/docker-compose.yml" push
done
```

(`database/database` -- Postgres -- isn't in this loop: it has nothing to
build, see step 2.)

No registry? Use the tar path instead — `docker compose -f <d>/docker-compose.yml build`,
then `docker save <image>:latest -o <svc>.tar`, scp the tar, `docker load -i <svc>.tar`
on the VPS, and leave `REGISTRY` unset there.

## 2. Files onto the VPS

Recreate the four folders (names matter — Compose derives the project name
and `.env` location from them):

```
database/database/docker-compose.yml   database/database/.env
database/database/docker-entrypoint-initdb.d/   (whole folder, Postgres has no image to bake it into)
database/docker-compose.yml            database/.env
catalog-api/docker-compose.yml         catalog-api/.env
map-api/docker-compose.yml             map-api/.env
```

Fill each `.env` from its `.env.example`. **`POSTGRES_USER` /
`POSTGRES_PASSWORD` are required** and must be identical in all four
(compose refuses to start without them, so the eve/eve/eve dev defaults
can't boot here by accident). Set `REGISTRY` (and `TAG`) in `database/.env`,
`catalog-api/.env`, and `map-api/.env` (Postgres pulls the stock image, no
registry needed), and `DB_DATA_VOLUME` in `database/database/.env`.
`chmod 600 */**.env`.

## 3. One-time setup

```bash
docker network create evebazaar-network
docker volume create evebazaar-db-data          # match DB_DATA_VOLUME in database/database/.env
```

## 4. Bring it up

```bash
# Postgres
docker compose -f database/database/docker-compose.yml pull
docker compose -f database/database/docker-compose.yml up -d

# one-time full ESI crawl -- populates the fresh DB, then exits (slow)
docker compose -f database/docker-compose.yml pull
docker compose -f database/docker-compose.yml run --rm database --mode sync

# the rest
docker compose -f database/docker-compose.yml up -d          # mktdata poll loop
docker compose -f catalog-api/docker-compose.yml pull && docker compose -f catalog-api/docker-compose.yml up -d
docker compose -f map-api/docker-compose.yml pull && docker compose -f map-api/docker-compose.yml up -d
```

Check:

```bash
docker ps
docker compose -f database/docker-compose.yml logs -f
curl -s localhost:8091/regions | head -c 200
curl -s localhost:8092/regions | head -c 200
```

## Updates

Rebuild + push a new `TAG` on the build machine, bump `TAG` in the VPS
`.env`, then per changed service:

```bash
docker compose -f catalog-api/docker-compose.yml pull
docker compose -f catalog-api/docker-compose.yml up -d
```

## Changing DB credentials later

`POSTGRES_*` only initialise the role on a fresh data volume. Against a
populated one:

```bash
docker compose -f database/database/docker-compose.yml exec db \
  psql -U <olduser> -d <db> -c "ALTER USER <olduser> RENAME TO <newuser>;"
docker compose -f database/database/docker-compose.yml exec db \
  psql -U <newuser> -d <db> -c "ALTER USER <newuser> WITH PASSWORD '<newpass>';"
```

Then update all four `.env` files and `up -d` the three consumer stacks.
Starting over: `docker compose -f database/database/docker-compose.yml down -v`
(destroys the volume), re-`docker volume create`, repeat from step 3.

## Reverse proxy — single domain

Both APIs serve themselves under a path prefix set by `API_BASE_PATH`
(`catalog-api/.env` -> `/api/catalog`, `map-api/.env` -> `/api/map`), so the
proxy forwards **without stripping** the prefix and everything — routes,
Swagger UI, OpenAPI JSON — lines up.

The frontend calls them same-origin with relative bases
(`evebazaar.com/.env`): `VITE_CATALOG_API_BASE_URL=/api/catalog`,
`VITE_MAP_API_BASE_URL=/api/map`. No CORS in play.

nginx:

```nginx
server {
    listen 443 ssl;
    server_name evebazaar.com;
    # ... ssl_certificate etc ...

    location /api/catalog/ {
        proxy_pass http://127.0.0.1:8091;      # no trailing slash -> prefix kept
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/map/ {
        proxy_pass http://127.0.0.1:8092;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        # the frontend (static bundle / its own container)
        proxy_pass http://127.0.0.1:5173;
    }
}
```

Caddy:

```
evebazaar.com {
    handle_path /api/catalog/* {
        rewrite * /api/catalog{uri}
        reverse_proxy 127.0.0.1:8091
    }
    handle_path /api/map/* {
        rewrite * /api/map{uri}
        reverse_proxy 127.0.0.1:8092
    }
    reverse_proxy 127.0.0.1:5173
}
```

(Or simpler in Caddy: `reverse_proxy /api/catalog/* 127.0.0.1:8091` with no
`handle_path`, since that keeps the path as-is.)

Leaving `API_BASE_PATH` empty makes a service serve at the root again — do
that if you'd rather strip the prefix at the proxy instead.

## Local dev

`./start.sh` — unchanged. It creates `evebazaar-network`, drops the
eve/eve/eve `database/database/.env` into place, runs Postgres in Docker and
the APIs + sync as local processes. The API/sync `docker-compose.yml` files
are not used locally.
