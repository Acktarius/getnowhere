# Holepunch sidecar (Hyperswarm)

**web app only** for daily `npm run dev`. Desktop uses Electron with the same
bridge contract (`docs/architecture/electron-desktop.md`). Mobile uses a Bare
worklet (`docs/architecture/mobile-p2p-runtime.md`).

Get Now Here is a **static Vite UI plus Pear-shaped P2P runtime** for web-dev:
the React/Vite layer is UI only; Hyperswarm lives in `holepunch-sidecar/`
(Node). The UI never imports `hyperswarm`.

## Networking architecture

- **UI layer:** TypeScript + React + Vite static bundle (browser today).
- **P2P runtime layer (web-dev):** Node sidecar — create swarm, join topics,
  peer streams, reconnect, frame fan-out.
- **Bridge layer:** typed WebSocket messages (schema below). Mobile replaces
  the transport (Bare IPC) but keeps the same command/event types.

### Important constraint

The Vite web app must **not** join Hyperswarm. Browser / plain WebView JS are
UI environments. Hyperswarm requires Bare/Node-class networking (UDP DHT).

### Required implementation rule

All Hyperswarm lifecycle operations happen in the runtime:

- create swarm
- join / leave derived `topicRef`
- accept connections and report peer counts
- multiplex opaque sealed frames
- report state changes to the UI

The React/Vite app only sends commands and renders state.

## Pear / Bare mapping

| Holepunch shape | This repo (web-dev) | Desktop (target) | Mobile (target) |
|---|---|---|---|
| Bare / Pear-end + Hyperswarm | `holepunch-sidecar/src/swarm.mjs` | Electron main / Pear-end | Bare worklet |
| IPC / pear-bridge | `server.mjs` (WebSocket) | Electron IPC / pear-bridge | Bare IPC |
| UI | Vite → `HolepunchChatTransport` | Vite in Electron renderer | Expo UI |

App-layer ChaCha20-Poly1305 seals frames in the app crypto path (L3 E2E). The
sidecar carries **already-sealed** payloads only (no session keys). Hyperswarm
Noise (L2) protects the DHT hop. See `docs/security/encryption.md`.

## Bridge contract (live — implement this)

Canonical types live in `src/services/p2p/HolepunchSidecarClient.ts`.
**Codegen must match these**, not invent alternate `swarm.join` / `chat.send`
unions.

### Client → runtime (commands)

```ts
type SidecarCommand =
  | { type: "ping" }
  | { type: "join"; topicRef: string; roomId: string }
  | { type: "leave"; topicRef: string; roomId: string }
  | { type: "frame"; topicRef: string; roomId: string; payload: string };
```

- `topicRef`: 64 hex chars (32-byte topic).
- `payload`: opaque sealed frame (base64 string today).

### Runtime → client (events)

```ts
type SidecarEvent =
  | { type: "pong" }
  | { type: "ready"; topicRef: string }
  | { type: "peers"; topicRef: string; count: number }
  | { type: "frame"; topicRef: string; roomId?: string; payload: string }
  | { type: "error"; message: string };
```

`connected` for a room is an **app-layer** decision when `peers.count >= 1`
(see `HolepunchChatTransport`), not a separate bridge event.

Mobile Bare IPC must speak this same schema (or a versioned superset documented
here first).

## Pages UI + packaged desktop

Ship paths (CI): GitHub Pages still hosts Vite `dist/` for browsers; the Linux
Electron Forge package **embeds** the same `dist/` under `resources/ui` and
loads it with `loadFile` (no runtime Pages fetch). See
`docs/builds/github-pages-and-desktop.md`. Web-dev still uses `npm run holepunch`
+ `npm run dev` without packaging.

## Storage and sync

If replicated history is added later, keep replication in the runtime and expose
state through the bridge. The UI must not import Hypercore/Hyperswarm primitives.

## Layout

```
holepunch-sidecar/
  package.json
  src/swarm.mjs    # one Hyperswarm; multi-topic join + local/remote fan-out
  src/server.mjs   # ws://127.0.0.1:7901 by default
  test/
```

## Run (Alice / Bob on one machine)

Install once:

```bash
npm run holepunch:install
```

Terminal A — sidecar:

```bash
npm run holepunch
```

Terminal B — web app:

```bash
npm run dev
```

Open two browser profiles against the same origin. Both use
`VITE_HOLEPUNCH_WS_URL` (default `ws://127.0.0.1:7901`).

**Dev note:** two UIs on one sidecar share a local fan-out path. That is a
convenience for same-machine testing; cross-machine peers still use the public
DHT via Hyperswarm.

Optional second sidecar:

```bash
HOLEPUNCH_PORT=7902 npm run holepunch
```

Then `VITE_HOLEPUNCH_WS_URL=ws://127.0.0.1:7902` for that profile.

## Two machines on one LAN

Each machine runs its **own** sidecar (or Electron isolated shell). The UI on
each host still talks to **localhost** `ws://127.0.0.1:7901` — that bridge port
is not Hyperswarm traffic.

Peers meet through HyperDHT (UDP). Requirements:

1. Matching `topicRef` (same accepted room / relationship).
2. Outbound UDP to public DHT bootstrap nodes (`*.hyperdht.org:49737`).
3. Host firewall allows **inbound UDP** for HyperDHT / holepunch (dynamic ports
   around the DHT socket — not TCP `7901`).
4. Clean sidecar shutdown so `swarm.destroy()` can unannounce (avoids stale DHT
   records that slow the next join).

### UFW pitfall

`ufw allow 7901` only affects the local WebSocket bridge. It does **not** open
Holepunch. On Ubuntu with UFW active, prefer allowing LAN UDP while testing:

```bash
sudo ufw allow from 192.168.0.0/16 to any proto udp comment 'GNH Holepunch LAN'
sudo ufw status verbose
```

Tighten later once you confirm L2 connects. Electron may show a read-only
advisory when UFW looks active after a Holepunch timeout — it never changes
firewall rules.

### Sidecar diagnostics

`npm run holepunch` now logs connection lifecycle (`connection open/closed`,
peer id prefix, inbound/outbound), DHT bootstrap health (`dht.nodes.length`
after `dht.ready()`), and re-announce attempts to stdout. An empty routing
table after bootstrap means outbound UDP to the public HyperDHT bootstrap
nodes is blocked or unreachable — peer discovery cannot work until that is
fixed, independent of any local UFW/inbound rule. Watch this output first when
diagnosing "L2 doesn't connect" before touching firewall rules.

### Discovery re-announce nudge

`discovery.flushed()` only confirms the local announce was published — it
says nothing about whether the other peer has been discovered yet. Left
alone, Hyperswarm's own idle re-lookup can wait ~10-12 minutes before trying
again if the peer joins shortly after us. The sidecar calls
`discovery.refresh()` on an escalating delay while a topic has zero remote
peers: 8s for the first three attempts, then 30s, then 60s steady state.

The schedule is **never capped** while the topic stays joined. An earlier
build stopped after 10 attempts (~80s), which silently dropped back to the
slow internal cycle exactly when it mattered — two peers whose 80s windows did
not overlap (one user opens the room minutes after the other) could miss each
other for the whole session and look identical to a NAT or topic failure. The
nudge also **resumes** if an adopted peer is later lost, so a reconnect does
not wait on that internal cycle either.

Steady state costs one log line per minute per topic with no peer; that noise
is the intended signal when diagnosing a room that never connects.

### Why "DHT bootstrap ok" does not guarantee L2 connects

`dht.nodes.length > 0` only proves outbound UDP reachability to the small,
fixed set of **public bootstrap nodes** — a much lower bar than two arbitrary
residential/mobile NATs punching a hole to each other. A "still 0 peers" that
persists across many re-announce nudges narrows to one of three buckets, and
the sidecar logs enough to tell them apart:

1. **Topic mismatch or DHT propagation miss** — the lookup itself finds
   nobody. Logged as `DHT candidates known: 0` on every nudge tick
   (`swarm.peers.size`, network-wide candidates the DHT has surfaced via
   lookup, not scoped to one topic). Compare `Topic:` in Room diagnostics on
   both peers first: `relationshipId` is derived locally on each side from the
   stored payment IDs and never travels on the wire, so mismatched inputs
   split the topic while the invite, accept, and `roomId` all still agree —
   see `docs/architecture/pairing-and-topics.md`.
2. **NAT/firewall defeats the punch** — the lookup **did** find the peer
   (`DHT candidates known` > 0) but no `connection open` log ever follows.
   The DHT rendezvous succeeded; the actual UDP hole punch between the two
   peers' NATs did not. Symmetric NAT / CGNAT on either side is the classic
   cause.
3. **We are the one behind a hostile NAT** — logged once per topic join as
   `[swarm] NAT: firewalled=… randomized=… reflexive=host:port`.
   `randomized=true` means our external port varies per destination (the
   signature of a symmetric NAT); direct holepunch to *any* peer is unlikely
   to succeed from behind one without a relay, independent of the remote
   side's network.

When it is bucket 2 or 3, the fix is not a firewall rule — it is a relay path
(Hyperswarm's own relay-through connect, or simply relying on the L1 chain
relay fallback the app already uses post-accept; see
`docs/security/p2pchatprotocol.md` §16). Watch this output before assuming a
protocol bug.

## Connected rule

Transport peer count ≥ 1 is necessary but not sufficient. The UI marks
`connected` only after the **post-connect L1 proof** (sealed `kind: "proof"`
frame) succeeds — see `docs/security/encryption.md`.

## Sidecar WS auth (optional)

When `GNH_SIDECAR_TOKEN` is set, clients must connect with `?token=<value>` or
the upgrade is closed (`4001`). Unset for web-dev (`npm run holepunch`).
Electron main always sets a per-launch token — `docs/architecture/electron-desktop.md`.

## Env

| Variable | Default | Where |
|---|---|---|
| `VITE_HOLEPUNCH_WS_URL` | `ws://127.0.0.1:7901` | Vite web app |
| `HOLEPUNCH_HOST` | `127.0.0.1` | sidecar |
| `HOLEPUNCH_PORT` | `7901` | sidecar |
| `GNH_SIDECAR_TOKEN` | (unset) | sidecar — required when set |

See also:

- `docs/architecture/electron-desktop.md`
- `docs/architecture/mobile-p2p-runtime.md`
- `docs/architecture/pairing-and-topics.md`
- `docs/architecture/pear-runtime.md`
- `docs/security/p2pchatprotocol.md`
