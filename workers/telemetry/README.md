# Telemetry worker

Anonymous launch telemetry for Nubium. Cloudflare Worker backed by D1.

- Dashboard: https://stats.nubium.rocks
- D1 database: `nubium-telemetry` (ID `ab4a35b8-92c6-459d-a7a4-a3d912d6b734`)

## Endpoints

- `GET /` — HTML dashboard (daily counts + breakdowns by OS / platform / version; 7d/30d/90d/1y toggle).
- `POST /ping` — body `{version, os, platform}`. Increments the daily aggregate. No IP, no user ID.
- `GET /stats?days=N` — returns `{daily, versions, oss, platforms}` JSON.

## Data model

One row per `(date, version, os, platform)` with a `count`. See `schema.sql`.

## Deploy

```
cd workers/telemetry
wrangler deploy
```

## Migrations

Run once before deploying a worker that depends on new schema:

```
wrangler d1 execute nubium-telemetry --file=migrations/001_add_platform.sql
```
