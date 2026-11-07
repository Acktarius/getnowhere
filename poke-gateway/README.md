# poke-gateway

Operator HTTP service for Get NowHere **peer wake**. It is **not** ntfy, and it does **not** run on phones.

Phones run the Get NowHere app only. You run this on a VPS (same host as ntfy is fine).

```
Alice's phone  --POST /poke-->  poke-gateway  --if iOS token in SQLite-->  Apple APNs
                                      |
                                      +--if no row (F-Droid)-->  ntfy.getnowhere.im  (publish token)
Bob's F-Droid phone  <--- SSE subscribe ---  ntfy  (no token; topic name is the capability)
```

**ntfy** delivers the wake to Android. **poke-gateway** is the front door the app calls, holds the ntfy **publish** token (never in the APK), and talks to APNs for iOS.

Design: `docs/features/peer-wake-notification.md`.

## You need both

1. **ntfy** Docker (already on the VPS): topics `gnh-*`, `gnh-publisher` write-only, `everyone` read-only.
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
| `NTFY_PUBLISH_TOKEN` | yes for F-Droid | `tk_…` from `sudo docker exec ntfy ntfy token add gnh-publisher` |
| `APNS_TEAM_ID` | iOS only | Apple Developer team id |
| `APNS_KEY_ID` | iOS only | Key id for the `.p8` |
| `APNS_KEY_PATH` | iOS only | Path **inside the container** to the `.p8` |
| `APNS_BUNDLE_ID` | iOS only | `im.getnowhere.app` |
| `HANDLE_TTL_DAYS` | no (default `30`) | Handles not re-registered within this many days are lazily expired on `/poke`. Active clients re-register on every app launch, so this only expires dormant installs. |

## Docker on the VPS

### Step 1 — create `.env`

The container reads `.env` at startup via `env_file: .env` in `docker-compose.yml`.
**Editing `.env` after the container is running has no effect until you recreate it** (see Step 3).

```bash
cd /opt/poke-gateway
cp .env.example .env
```

Edit `.env` and fill in every value you need:

```bash
# Required for F-Droid wake
NTFY_BASE_URL=https://ntfy.getnowhere.im
NTFY_PUBLISH_TOKEN=tk_…          # from: sudo docker exec ntfy ntfy token add gnh-publisher

# Required for iOS wake (skip if F-Droid only)
APNS_TEAM_ID=XXXXXXXXXX
APNS_KEY_ID=XXXXXXXXXX
APNS_BUNDLE_ID=im.getnowhere.app
# APNS_KEY_PATH is already set to /secrets/AuthKey.p8 in docker-compose.yml

# Optional (default 30)
HANDLE_TTL_DAYS=30
```

`PORT` and `DB_PATH` are set in `docker-compose.yml` and do not need to appear in `.env`.

### Step 2 — build and start

```bash
cd /opt/poke-gateway
sudo docker compose up -d --build
```

`docker-compose.yml` binds **`127.0.0.1:3456`** only. Point Caddy/nginx at that, HTTPS on a public name (e.g. `https://poke.getnowhere.im`).

SQLite lives in the `poke-data` volume. APNs `.p8` (if used) is bind-mounted from `./secrets/AuthKey.p8` (gitignored).

### Step 3 — apply `.env` changes after first deploy

A plain `docker restart` does **not** reload `.env`. Any time you edit `.env`, recreate the container:

```bash
cd /opt/poke-gateway
sudo docker compose up -d --force-recreate poke-gateway
# confirm the value landed:
sudo docker compose exec poke-gateway printenv HANDLE_TTL_DAYS
```

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

The app ships **no ntfy credential**. `NTFY_PUBLISH_TOKEN` and `APNS_*` stay
**only** in poke-gateway `.env` (VPS). Do not upload the AuthKey to EAS.

## ntfy server setup and maintenance

ntfy is deployed on the VPS as a Docker container managed by
`/opt/ntfy-compose.yml` (service name `ntfy`). The `ntfy` CLI is **not**
installed on the host — every `ntfy` command runs via `sudo docker exec ntfy`.

**VPS paths (actual):**

| Path on host | Purpose |
|---|---|
| `/opt/ntfy-compose.yml` | Compose file |
| `/etc/ntfy/server.yml` | ntfy config (bind-mounted into container) |
| `/var/cache/ntfy/auth.db` | Users and ACLs (bind-mounted — safe across recreates) |
| `/var/cache/ntfy/cache.db` | Message cache (bind-mounted) |

### First-time setup (fresh VPS)

**Step 1 — create the `gnh-publisher` user and get its token.**

```bash
sudo docker exec ntfy ntfy user add --role=user gnh-publisher
sudo docker exec ntfy ntfy token add gnh-publisher
```

Copy the `tk_…` token — this becomes `NTFY_PUBLISH_TOKEN` in poke-gateway `.env`.

**Step 2 — set access rules.**

```bash
sudo docker exec ntfy ntfy access gnh-publisher 'gnh-*' write-only
sudo docker exec ntfy ntfy access everyone       'gnh-*' read-only
```

ACL changes apply immediately — no restart needed.

**Step 3 — confirm `server.yml` has `auth-default-access: "deny-all"`.**

```bash
sudo grep auth-default-access /etc/ntfy/server.yml
```

If it is missing or set to anything else, add/fix it and restart ntfy (see
Restart section below). Every topic outside `gnh-*` must be denied.

**Step 4 — set a short cache duration** (limits wake-history replay if a
`pokeId` leaks). Add to `server.yml` if not present:

```bash
sudo grep -q 'cache-duration' /etc/ntfy/server.yml || \
  sudo sed -i '/^cache-file:/a cache-duration: "10m"' /etc/ntfy/server.yml
```

**Step 5 — restart ntfy to load the config change**, then verify.

```bash
sudo docker compose -f /opt/ntfy-compose.yml restart ntfy
curl -sS https://ntfy.getnowhere.im/v1/health
# expect: {"healthy":true}
```

**Step 6 — verify anonymous read works** (this is the path the F-Droid app
uses — no token).

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://ntfy.getnowhere.im/gnh-AAAAAAAAAAAAAA/json?poll=1'
# expect: 200  (403 = step 2 did not apply)
```

**Step 7 — smoke-test the full F-Droid wake path.**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://poke.getnowhere.im/poke \
  -H 'Content-Type: application/json' -d '{"to":"AAAAAAAAAAAAAA"}'
# expect: 202
```

### Confirm current ACL at any time

```bash
sudo docker exec ntfy ntfy access
```

Expected output:

```
user gnh-publisher (role: user, tier: none)
- write-only access to topic gnh-*
user * (role: anonymous, tier: none)
- read-only access to topic gnh-*
- no access to any (other) topics (server config)
```

### Restart ntfy (after a `server.yml` change)

```bash
sudo docker compose -f /opt/ntfy-compose.yml restart ntfy
sudo docker ps --filter name=ntfy --format '{{.Names}}  {{.Status}}'
# expect: ntfy  Up N seconds
curl -sS https://ntfy.getnowhere.im/v1/health
# expect: {"healthy":true}
```

### Update the ntfy image

The auth database is bind-mounted at `/var/cache/ntfy/auth.db`, so it survives
a container recreate. Back it up first anyway:

```bash
sudo cp -a /var/cache/ntfy/auth.db /root/ntfy-auth.db.bak-$(date +%F)
sudo docker compose -f /opt/ntfy-compose.yml pull ntfy
sudo docker compose -f /opt/ntfy-compose.yml up -d ntfy
curl -sS https://ntfy.getnowhere.im/v1/health
# expect: {"healthy":true}
```

Re-run Step 6 after every update to confirm anonymous read is still working.

### Security notes

- `auth-default-access: "deny-all"` in `server.yml` is mandatory — the ACL grants
  cover `gnh-*` only.
- The topic name `gnh-<pokeId>` is the read capability. Anyone who learns a
  `pokeId` can observe wake **timing** on that topic until the room destroys and
  rotates it. The payload is the literal string `wake` — no room, sender, or
  message content is exposed.
- `cache-duration: "10m"` limits how much history a leaked `pokeId` can replay.
- `NTFY_PUBLISH_TOKEN` must stay in poke-gateway `.env` on the VPS only — never
  in the app or in this repo.

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
| `POST` | `/poke` | `{ to }` 14-char base64url | `202` (or `400` / `429` / `502` / `503`). `429` carries `Retry-After`: `1` when the process cap is spent, `300` when that handle was poked in the last 5 minutes. |
| `DELETE` | `/register` | `{ pokeHandle }` | `204` |

Logs are aggregates only (no handle, token, or IP).

`/poke` keeps the per-handle window (1 per 5 minutes) and also a process-wide
bucket (burst 10, refill 1/s) checked before that window. A spent bucket returns
`429` and does not call ntfy or APNs. The ntfy publish aborts after 5 seconds.
Client IP is not read from `X-Forwarded-For`. See `docs/features/peer-wake-notification.md`.

A registered handle that has not been re-registered within `HANDLE_TTL_DAYS`
(default 30) is treated as expired: `/poke` returns `202` without calling APNs
and lazily deletes the row. Active clients re-register on every app launch, so
only dormant/uninstalled clients expire. This is the server-side backstop for a
lost client-side `DELETE /register` (see `SEC-2026-028`).
