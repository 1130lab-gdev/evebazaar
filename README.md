# EVE Bazaar

Cross-system arbitrage scanning and multi-hop hauling route planning for
EVE Online. Live at [evebazaar.com](https://evebazaar.com).

EVE Bazaar pulls public market and universe data from CCP's
[ESI API](https://developers.eveonline.com/) into Postgres. It then serves
that data through two read-only APIs to a React frontend that has route
planning, market browsing and a 3D galaxy map. There are no accounts and no
login, and the site uses no EVE SSO.

## Layout

| folder | what it is | stack |
|---|---|---|
| `database/database/` | Postgres 16 plus the ESI schema (`docker-entrypoint-initdb.d/`) | Docker |
| `database/` | ESI sync: one full crawl, then a market-order poll loop | Rust |
| `catalog-api/` | read-only API for items, markets and the route planner (port 8091) | Rust, axum |
| `map-api/` | read-only API for regions, systems and the jump graph (port 8092) | Rust, axum |
| `evebazaar.com/` | the public site | React, Vite, three.js |
| `map-sandbox/` | standalone galaxy-map experiment | React, Vite, three.js |
| `tgi/` | computes a slow-moving economic index from market data | Rust |

Both APIs serve Swagger UI and their OpenAPI JSON.

## Running locally

Requirements: Docker, a stable Rust toolchain (edition 2024) and Node.js
with npm.

`database` depends on [rfesi](https://github.com/mccabe93/rfesi), an ESI
client crate that lives in its own repo. Clone it at the repo root before
building:

```bash
git clone https://github.com/mccabe93/rfesi
```

Then:

```bash
./start.sh          # start everything (safe to re-run)
./start.sh status   # what's up
./stop.sh           # stop everything
```

`start.sh` creates the `evebazaar-network` Docker network and drops a dev
`database/database/.env` (user, password and DB all `eve`) into place. It
runs Postgres in Docker on `127.0.0.1:5532` and runs the sync, both APIs and
the Vite dev server as local processes. Logs and PIDs go to `.run/`.

The first run does a full ESI crawl, which takes a couple of hours. After
that the sync only polls market orders, every 300 seconds by default.

| service | URL |
|---|---|
| frontend | http://localhost:5173 |
| catalog-api | http://localhost:8091 |
| map-api | http://localhost:8092 |

## Configuration

Each service has a `.env.example`. Copy it to `.env` in the same folder and
fill it in. Real `.env` files are gitignored. Any non-local deployment must
set its own `POSTGRES_USER` and `POSTGRES_PASSWORD`, and the values must
match across every service.

The frontend's `VITE_*` API URLs are baked in at build time, so rebuild
after changing them.

## Deploying

See [DEPLOY.md](DEPLOY.md). Each service ships as its own Docker Compose
stack behind a TLS reverse proxy on a single domain.

## License

[MIT](LICENSE).

EVE Online and the EVE logo are the registered trademarks of CCP hf. All
rights are reserved worldwide. All other trademarks are the property of
their respective owners. EVE Online, the EVE logo, EVE and all associated
logos and designs are the intellectual property of CCP hf. All artwork,
screenshots, characters, vehicles, storylines, world facts or other
recognizable features of the intellectual property relating to these
trademarks are likewise the intellectual property of CCP hf. CCP hf. has
granted permission to EVE Bazaar to use EVE Online and all associated logos
and designs for promotional and information purposes on its website but
does not endorse, and is not in any way affiliated with, EVE Bazaar. CCP is
in no way responsible for the content on or functioning of this website, nor
can it be liable for any damage arising from the use of this website.
