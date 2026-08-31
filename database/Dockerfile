# Build context must be the repo root (not database/), since this crate
# depends on the sibling ../rfesi crate (path dependency, not on crates.io).
# See docker-compose.yml: build.context: . / build.dockerfile: database/Dockerfile

FROM rust:1-bookworm AS build
WORKDIR /app
COPY rfesi/ rfesi/
COPY database/ database/
WORKDIR /app/database
RUN cargo build --release

FROM debian:bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/database/target/release/database /usr/local/bin/database
ENTRYPOINT ["database"]
# Default to the mktdata loop. Needs the DB already populated by a one-time
# full sync first -- if `regions` is empty, mktdata has nothing to poll for
# and just loops doing nothing (same caveat start.sh's ensure_database
# works around). Run the initial sync once with:
#   docker compose run --rm database --mode sync
CMD ["--mode", "mktdata"]
