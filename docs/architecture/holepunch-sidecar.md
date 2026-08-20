# Holepunch sidecar (Hyperswarm)

**web app only** for daily `npm run dev`. Desktop uses Electron with the same
bridge contract (`docs/architecture/electron-desktop.md`). Mobile uses a Bare
worklet (`docs/architecture/mobile-p2p-runtime.md`).

Get NowHere is a **static Vite UI plus Pear-shaped P2P runtime** for web-dev:
the React/Vite layer is UI only; Hyperswarm lives in `holepunch-sidecar/`
(Node). The UI never imports `hyperswarm`.

## Networking architecture

- **UI layer:** TypeScript + React + Vite static bundle (browser today).
- **P2P runtime layer (web-dev):** Node sidecar — create swarm, join topics,
  peer streams, reconnect, frame fan-out.
- **Bridge layer:** typed WebSocket messages (schema below). Transport policy
  and roadmap (ws → wss → IPC): `docs/architecture/local-bridge-transport.md`.
  Mobile replaces the transport (Bare IPC) but keeps the same command/event types.

### Important constraint

The Vite web app must **not** join Hyperswarm. Browser / plain WebView JS are
UI environments. Hyperswarm requires Bare/Node-class networking (UDP DHT).

### Required implementation rule

All Hyperswarm lifecycle operations happen in the runtime:

- create swarm
- join / leave derived `topicRef`
- accept connections and report peer counts (Hyperswarm-shared topics only —
  invite already carries `topicRef`; do not NDJSON-hello the local topic set)
- multiplex opaque sealed frames (inbound and outbound both require the
  connection’s Hyperswarm-shared `connTopics` membership for that `topicRef`;
  foreign-labeled inbound frames are silently dropped)
- report state changes to the UI

The React/Vite app only sends commands and renders state.

## Pear / Bare mapping

| Holepunch shape | This repo (web-dev) | Desktop (target) | Mobile (target) |
|---|---|---|---|
| Bare / Pear-end + Hyperswarm | `holepunch-sidecar/src/swarm.mjs` | Electron main / Pear-end | Bare worklet |
| IPC / pear-bridge | `server.mjs` (WebSocket) | Electron IPC / pear-bridge | Bare IPC |
| UI | Vite → `HolepunchChatTransport` | Vite in Electron renderer | Expo UI |

App-layer ChaCha20-Poly1305 seals frames in the app crypto path (**L1 session
seal**). The sidecar carries **already-sealed** payloads only (no session keys).
Hyperswarm Noise (**L2**) protects the DHT hop. There is no L3 — see
`docs/security/encryption.md`.

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
- `frame` is accepted only after this socket has `join`ed that `topicRef`
  (mesh also requires the sender in `localClients`). Otherwise the bridge
  replies `{ type: "error", code: "frame_requires_join", message: "…" }`.

### Runtime → client (events)

```ts
type SidecarEvent =
  | { type: "pong" }
  | { type: "ready"; topicRef: string }
  | { type: "peers"; topicRef: string; count: number }
  | { type: "frame"; topicRef: string; roomId?: string; payload: string }
  | { type: "error"; code: string; message: string };
```

Every `error` includes a stable `code`. Canonical table and client guidance:
`docs/architecture/holepunch-bridge-errors.md` (codes live in
`holepunch-sidecar/src/errors.mjs`).

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
  config.json           # maxNdjsonLineBytes / maxWsMessageBytes /
                        # maxFramePayloadBytes / reserved maxFileBytes
  src/config.mjs        # load limits with defaults
  src/errors.mjs        # BRIDGE_ERRORS map + bridgeError()
  src/swarm.mjs         # one Hyperswarm; multi-topic join + local/remote fan-out
  src/server.mjs        # WebSocket bridge (default ws://127.0.0.1:7901)
  src/parent-death.mjs  # exit when Electron parent dies
  test/
```

### WS size bounds

Inbound bridge messages are bounded by `maxWsMessageBytes` (default **270336**)
before `JSON.parse`; `frame.payload` UTF-8 length by `maxFramePayloadBytes`
(default **262144**). The WebSocket server also sets
`maxPayload: maxWsMessageBytes`. Oversize → coded error then close **1009**.
Full code map and close-hook notes:
`docs/architecture/holepunch-bridge-errors.md`.

### NDJSON line cap

Hyperswarm peer streams are split with `createLineReader`. Pending / complete
lines are capped by `maxNdjsonLineBytes` (default **262144**, from
`config.json`). On overflow the reader clears its buffer and throws; the
connection handler logs the peer and calls `conn.destroy()`. Other connections
and the sidecar process stay up. `maxFileBytes` is reserved for a future media
path and is not applied to chat NDJSON frames.

## Packaged desktop bridge (ephemeral port)

When Electron spawns the sidecar with `HOLEPUNCH_PORT=0` and an IPC channel
(`stdio` includes `'ipc'`):

1. The OS assigns a free loopback port.
2. On `listening`, the sidecar logs the **real** bound port (`wss.address().port`,
   never `0`) and `process.send({ type: "listening", host, port })`.
3. Electron waits for that IPC message (bounded timeout), then builds
   `ws://127.0.0.1:<port>` for the renderer (also via `additionalArguments`).
4. Packaged builds use a per-launch `randomUUID()` token and **do not** write a
   `$TMPDIR/gnh-sidecar-*.token` lockfile.
5. On `EADDRINUSE` (or other listen errors), the sidecar logs and exits non-zero.
6. Parent-death watch: poll whether the **start-time parent PID** is still alive
   (`kill(pid, 0)`; EPERM counts as alive). Skip the watch if that PID is not
   usable at start. **Do not** exit on bare `process.ppid` changes — that was
   the v0.1.7 regression vs v0.1.6 (sidecar died ~1s after listen → UI
   Holepunch fail↔connecting, no outbound/inbound). Set
   `GNH_DISABLE_PARENT_DEATH=1` to disable.

Web-dev `npm run holepunch` and the Alice/Bob harness keep fixed ports and
`stdio: inherit` (no IPC required).

## Desktop native IPC bridge

When `GNH_BRIDGE_TRANSPORT=ipc` and `GNH_IPC_PATH` is set (Electron main
generates the path):

1. The sidecar listens on a Unix domain socket (Linux/macOS) or named pipe
   (Windows) — no loopback TCP bridge.
2. On listen, `process.send({ type: "listening", transport: "ipc", path })`.
3. One NDJSON line per message; same `SidecarCommand` / `SidecarEvent` schema.
4. Size limits match WebSocket (`maxWsMessageBytes`, join-gated frames).
5. Stale Unix socket files are unlinked before bind when safe.

Web-dev keeps default `GNH_BRIDGE_TRANSPORT=ws` (unset).

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

## Two machines on one LAN (developer pitfall)

Each machine runs its **own** sidecar (or Electron shell). The UI on each host
still talks to **localhost** `ws://127.0.0.1:7901` — that bridge port is not
Hyperswarm traffic.

### Same LAN vs internet peers (product expectation)

| Setup | How HyperDHT connects | Must end users edit UFW / open ports? |
|---|---|---|
| Two PCs on the **same LAN** (same private subnet), **no VPN**, host firewall default-deny (e.g. Ubuntu UFW) | HyperDHT detects the **same reflexive public host** and prefers a **LAN shortcut**: UDP ping to the peer’s **private** address on dynamic DHT ports | **Developer / lab only.** Inbound LAN UDP must be allowed on **both** hosts or L2 never opens. This is **not** the expected end-user product path. |
| Same physical LAN, but **one peer on a VPN** | Reflexive public hosts usually **differ** (VPN egress ≠ home router). HyperDHT skips the LAN shortcut and uses normal **internet-style holepunch** (outbound UDP + temporary mappings) | **No** for that pair — lab confirmed L2 can connect without a LAN UDP allow rule. Still not a product “use a VPN” requirement. |
| Two users on **different networks / NATs** (normal worldwide use) | Public DHT rendezvous + UDP holepunch via **outbound** traffic and temporary NAT mappings | **No.** Ordinary users must not be told to open UFW or forward ports. |
| Hostile NAT (symmetric NAT / some CGNAT) | Direct punch fails even when DHT bootstrap works | **No.** UFW will not fix it — need an L2 relay (product work); L1 chain relay is today’s post-accept safety net (`docs/security/p2pchatprotocol.md` §16). |

Product constraint: **do not require ordinary users to configure host firewalls.**
Same-LAN + UFW (both peers off VPN, same reflexive host) is a known **developer**
edge case when testing two physical machines behind one router.

### Why a VPN on one machine can “fix” the LAN UFW pitfall

Observed in lab: two computers on the same network, **one using a VPN**, L2
connected **without** allowing LAN UDP in UFW.

Mechanism: the LAN shortcut only runs when both sides advertise the **same**
reflexive public host. A VPN typically gives that peer a different public
egress, so HyperDHT treats them like an internet pair and holepunches over the
outbound/VPN path instead of pinging private LAN addresses. Host UFW rules that
only bite **inbound from the LAN subnet** never see that traffic.

**Practical local test tip:** to verify L2 between two physical machines on the
same LAN **without** editing UFW, put **one** peer on a VPN (or otherwise give
it a different public egress). That is often enough to get a working connect
for day-to-day development. Prefer this over opening broad LAN UDP rules when
you only need “does chat work?” — not when you are specifically debugging the
same-LAN path.

Implications:

- This tip **masks** the same-LAN + UFW failure mode; it does not prove that
  path is healthy.
- Do **not** tell end users to install a VPN to make chat work — accidental
  path change, not product design.
- To reproduce the real same-LAN + UFW failure, both peers must be **off VPN**
  and share one reflexive public host.

### Same-LAN requirements (lab)

1. Matching `topicRef` (same accepted room / relationship) — compare `Topic:`
   in Room diagnostics on both peers.
2. Outbound UDP to public DHT bootstrap nodes (`*.hyperdht.org:49737`).
3. Host firewall allows **inbound UDP from the LAN** for HyperDHT / holepunch
   (**dynamic** ports on the DHT socket — **not** TCP `7901`).
4. Clean sidecar shutdown so `swarm.destroy()` can unannounce (avoids stale DHT
   records that slow the next join).

When both peers share one reflexive public host, diagnose **LAN inbound UDP**
before assuming a protocol bug. Internet holepunch is not the primary path for
that pair.

### UFW pitfall (same-LAN lab only)

`ufw allow 7901` only affects the local WebSocket bridge. It does **not** open
Holepunch.

On Ubuntu with UFW active while testing **two machines on one LAN**, allow UDP
from the LAN subnet on **both** computers (each host is the receiver of the
other’s LAN ping). Match the subnet your NICs actually use (example for a
common home `192.168/16` LAN):

```bash
# Example only — adjust the source range to your LAN (e.g. 10.0.0.0/8)
sudo ufw allow from 192.168.0.0/16 to any proto udp comment 'GNH Holepunch LAN'
sudo ufw status verbose
```

Restart both sidecars / Electron apps after changing rules so connect state is
not stuck on a pre-fix backoff. Tighten or remove the rule once lab L2 is
confirmed.

Electron may show a read-only UFW advisory when UFW looks active after a
Holepunch timeout — it never requests elevation or changes rules.

### Connection direction logs (not a failure)

Both peers join Hyperswarm as `client: true, server: true`, so both may dial.
Hyperswarm keeps **one** stream per remote key and destroys the duplicate
(`ERR_DUPLICATE`). Sidecar stdout then shows:

- One side: `connection open … direction=outbound` (and often
  `connection reset by peer` on the discarded dial)
- Other side: `connection open … direction=inbound` for the **same** surviving
  stream

That asymmetry is **normal** after a successful connect. If chat frames arrive
over L2, treat the reset lines as dedup noise, not a broken link. (Improving
those log labels is a follow-up; do not misread them as “inbound blocked.”)

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
2. **Punch / LAN path fails after discovery** — the lookup **did** find the
   peer (`DHT candidates known` > 0) but no lasting `connection open` follows.
   Split this further:
   - **Same LAN + host firewall** — both peers share one reflexive public
     host; HyperDHT’s LAN shortcut needs inbound UDP on dynamic ports. Lab
     fix: allow LAN UDP on both hosts (see § Two machines on one LAN). **Not**
     an end-user product requirement.
   - **Cross-internet NAT** — holepunch between two residential/mobile NATs
     failed. Symmetric NAT / CGNAT is the classic cause; opening UFW on the
     client does not replace a relay.
3. **We are the one behind a hostile NAT** — logged once per topic join as
   `[swarm] NAT: firewalled=… randomized=… reflexive=…` (do not paste real
   addresses into tickets or chat context). `randomized=true` means our
   external port varies per destination (symmetric-NAT signature); direct
   holepunch to *any* peer is unlikely without a relay.

When bucket 2 is **cross-internet** or bucket 3 applies, the product fix is a
relay path (Hyperswarm relay-through, or the L1 chain relay fallback the app
already uses post-accept; see `docs/security/p2pchatprotocol.md` §16) — **not**
telling users to edit UFW. When bucket 2 is **same-LAN lab + UFW**, allow LAN
UDP on both machines for that test only. Watch sidecar output before assuming
a protocol bug.

## Connected rule

Transport peer count ≥ 1 is necessary but not sufficient. The UI marks
`connected` only after the **post-connect L1 proof** (sealed `kind: "proof"`
frame) succeeds — see `docs/security/encryption.md`.

## Sidecar bridge auth and transport

The local bridge is **not** the relationship credential path — Conceal L1
distributes capability material; the bridge carries commands and opaque sealed
frames only (`docs/security/capabilities-and-derivation.md`).

**Transport policy:** loopback WebSocket today; target `wss://` with cert
pinning, then IPC/Unix socket — ranked options and hardening checklist in
`docs/architecture/local-bridge-transport.md`.

**Auth (shipped):** non-loopback bind (`HOLEPUNCH_HOST` not in
`127.0.0.1` / `::1` / `localhost`) requires `GNH_SIDECAR_TOKEN` at startup —
process exits before listen if missing. Loopback without a token remains the
explicit web-dev exception (`npm run holepunch`).

When a token is set, clients must connect with `?token=<value>` or the upgrade
is closed (`4001`). Comparison is timing-safe (`crypto.timingSafeEqual` on
equal-length buffers). Electron main always sets a per-launch token
(packaged builds use a fresh UUID) — `docs/architecture/electron-desktop.md`.

## Env

| Variable | Default | Where |
|---|---|---|
| `VITE_HOLEPUNCH_WS_URL` | `ws://127.0.0.1:7901` | Vite web app |
| `HOLEPUNCH_HOST` | `127.0.0.1` | sidecar |
| `HOLEPUNCH_PORT` | `7901` (`0` = ephemeral) | sidecar (WS mode) |
| `GNH_BRIDGE_TRANSPORT` | `ws` | `ws` \| `ipc` — desktop uses `ipc` |
| `GNH_IPC_PATH` | (unset) | sidecar — required when transport is `ipc` |
| `GNH_SIDECAR_TOKEN` | (unset) | sidecar WS auth — not used in `ipc` mode |
| `GNH_PARENT_POLL_MS` | `1000` | sidecar parent-death poll |
| `GNH_DISABLE_DISCOVERY` | unset | test-only: skip Hyperswarm DHT |

See also:

- `docs/architecture/electron-desktop.md`
- `docs/architecture/mobile-p2p-runtime.md`
- `docs/architecture/pairing-and-topics.md`
- `docs/architecture/pear-runtime.md`
- `docs/security/p2pchatprotocol.md`
