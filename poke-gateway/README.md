# poke-gateway

Operator HTTP service for Get NowHere **peer wake**. It is **not** ntfy, and it does **not** run on phones.

Phones run the Get NowHere app only. You run this on a VPS (same host as ntfy is fine).

```
Alice's phone  --POST /poke-->  poke-gateway  --if iOS token in SQLite-->  Apple APNs
                                      |
                                      +--if no row (F-Droid)-->  ntfy.getnowhere.im  (publish token)
Bob's F-Droid phone  <--- SSE subscribe ---  ntfy  (read token in the APK)
```

**ntfy** delivers the wake to Android. **poke-gateway** is the front door the app calls, holds the ntfy **publish** token (never in the APK), and talks to APNs for iOS.

Design: `docs/features/peer-wake-notification.md`.

## You need both

1. **ntfy** Docker (already on the VPS): topics `gnh-*`, `gnh-publisher` write-only, `gnh-reader` read-only.
2. **This service**: `POST /poke` → APNs or ntfy POST.

F-Droid wake fails if poke-gateway is missing: the app never publishes to ntfy itself.

## Prerequisites

- Docker + Compose on the VPS
- ntfy up at `https://ntfy.getnowhere.im` with `NTFY_PUBLISH_TOKEN` (`gnh-publisher`)
- A hostname + TLS reverse proxy (same pattern as ntfy: listen on `127.0.0.1` only)
- Optional for F-Droid-only: skip APNs keys. Required for iOS wake: Apple `.p8` key (`APNS_*`)

**APNs operator checklist** (create App ID → Production AuthKey → VPS
`secrets/AuthKey.p8` → `APNS_*`): see
[`docs/builds/expo-eas-ios-build.md`](../docs/builds/expo-eas-ios-build.md)
§ APNs AuthKey. The `.p8` never goes to EAS.

## Environment

Copy `.env.example` to `.env` on the **server** (never commit `.env`).

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (default `3456`) | Listen port inside the container |
| `DB_PATH` | Docker: `/data/poke.db` | SQLite: iOS `pokeHandle` → APNs token |
| `NTFY_BASE_URL` | yes for F-Droid | e.g. `https://ntfy.getnowhere.im` |
| `NTFY_PUBLISH_TOKEN` | yes for F-Droid | `tk_…` from `ntfy token add gnh-publisher` |
| `APNS_TEAM_ID` | iOS only | Apple Developer team id |
| `APNS_KEY_ID` | iOS only | Key id for the `.p8` |
| `APNS_KEY_PATH` | iOS only | Path **inside the container** to the `.p8` |
| `APNS_BUNDLE_ID` | iOS only | `im.getnowhere.app` |

## Docker on the VPS

From this directory (repo clone or copied `poke-gateway/` tree):

```bash
cp .env.example .env
# edit .env — set NTFY_BASE_URL and NTFY_PUBLISH_TOKEN
docker compose up -d --build
```

`docker-compose.yml` binds **`127.0.0.1:3456`** only. Point Caddy/nginx at that, HTTPS on a public name (e.g. `https://poke.getnowhere.im`).

SQLite lives in the `poke-data` volume. APNs `.p8` (if used) is bind-mounted from `./secrets/AuthKey.p8` (gitignored).

### Reverse proxy

Same idea as ntfy (`behind-proxy`). Example nginx site:

```nginx
server {
    listen 443 ssl http2;
    server_name poke.getnowhere.im;

    # ssl_certificate / ssl_certificate_key — same pattern as ntfy.getnowhere.im

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Smoke tests (on the VPS or your laptop)

```bash
curl -sS https://poke.getnowhere.im/health
# {"ok":true}

# F-Droid path: unknown handle → ntfy POST, always 202
curl -sS -o /dev/null -w "%{http_code}\n" -X POST https://poke.getnowhere.im/poke \
  -H "Content-Type: application/json" \
  -d '{"to":"AAAAAAAAAAAAAA"}'
```

Use a real 14-char base64url `to` (the peer’s `ph` / pokeId). HTTP `202` means the gateway accepted the poke (ntfy or APNs is best-effort).

## Wire the app builds

The Vite UI calls this base URL. If unset, `sendPoke` is a no-op.

| Place | Variable |
|---|---|
| Root `.env` (local) | `VITE_POKE_GATEWAY_URL=https://poke.getnowhere.im` |
| GitHub Actions APK | Secret `VITE_POKE_GATEWAY_URL` on the `mobile:android:release` step |
| iOS / EAS | Bake via `npm run mobile:sync-ui` **before** `eas build` (same `VITE_*` in root `.env`) |

`VITE_NTFY_READ_TOKEN` stays in the **app** build (SSE). `NTFY_PUBLISH_TOKEN`
and `APNS_*` stay **only** in poke-gateway `.env` (VPS). Do not upload the
AuthKey to EAS.

## Local run (no Docker)

```bash
cp .env.example .env
npm install
npm run dev
```

Listens on `0.0.0.0:3456`. Tests: `npm test`.

## HTTP API

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/health` | — | `{ ok: true }` |
| `POST` | `/register` | `{ token, platform: "apns", env, pokeHandle? }` | `{ pokeHandle }` (iOS) |
| `POST` | `/poke` | `{ to }` 14-char base64url | `202` (or `400` / `429` / `502` / `503`) |
| `DELETE` | `/register` | `{ pokeHandle }` | `204` |

Logs are aggregates only (no handle, token, or IP).
