# Local bridge transport (UI ↔ sidecar)

Policy and roadmap for the **local-only** link between the Vite UI and the
Hyperswarm runtime (sidecar or Bare worklet). This channel never carries
Alice↔Bob traffic.

@see `docs/architecture/holepunch-sidecar.md` · `docs/security/capabilities-and-derivation.md`
· `docs/security/encryption.md`

## Scope

```text
Alice wallet (L1 Conceal)     Bob wallet (L1 Conceal)
        │                              │
        ▼                              ▼
Alice UI ── local bridge ── Alice sidecar ── Hyperswarm L2 ── Bob sidecar ── local bridge ── Bob UI
              (this doc)                         ▲
                                                 └── never ws:// between machines
```

Relationship credentials (`roomId`, handshake seeds, derived `topicRef`) flow
through **encrypted Conceal SmartMessages**, not through this bridge
(`docs/security/capabilities-and-derivation.md`).

## Decision: ranked options (production desktop)

| Choice | Recommendation | Why |
|---|---|---|
| Electron IPC → main/utility → Unix socket / named pipe sidecar | **Best (later)** | No TCP listener; OS local access controls |
| `wss://127.0.0.1` + cert pinning + capability token | **Good (next)** | Encrypted loopback; minimal API change from today |
| `ws://127.0.0.1` + L1 session seal + capability token | **Acceptable (now)** | Content protected by app crypto; metadata still on loopback |
| Any `ws://` on LAN / public interface | **Never** | Plaintext, tamperable; use `wss://` + token or refuse bind |

**Do not discard working WebSocket code solely to adopt IPC.** Harden the
existing boundary first; plan IPC/native sockets as a follow-on when the
relationship and P2P flow is stable.

### wss:// vs IPC

`wss://` with pinning is **sufficient** as practical defense in depth for the
local TCP hop — particularly under configuration drift. IPC remains the
**stronger long-term** choice when minimizing localhost attack surface matters
more than keeping a WebSocket API.

Given existing WebSocket-based code, the approved roadmap is:

1. **Now:** harden `ws://127.0.0.1` (strict bind, token, limits — mostly shipped).
2. **Next release:** `wss://127.0.0.1:<ephemeral-port>` + cert pinning + token.
3. **Later (desktop shipped):** Electron IPC to main, then Unix socket (Linux/macOS) / named pipe
   (Windows) to sidecar — same bridge message schema, different transport.

Mobile already uses Bare IPC (no WebSocket). Browser web-dev may keep loopback
WebSocket longest (no Electron main to proxy IPC).

## Current state (shipped)

| Surface | Transport | Bind | Auth |
|---|---|---|---|
| Browser web-dev | `ws://127.0.0.1:7901` | Loopback default | Token optional |
| Electron dev harness | Native IPC (default) or `ws://` when `GNH_HOLEPUNCH_WS_URL` set | UDS / named pipe or loopback | None on IPC; token on WS override |
| Packaged desktop | Native IPC (default) | Per-launch socket path | None on IPC |
| Mobile | Bare IPC | In-process | N/A |

Packaged desktop: `HOLEPUNCH_PORT=0` → OS ephemeral port; sidecar reports port
via Node IPC; renderer receives `holepunchWsUrl` + `wsToken` from Electron main
(`docs/architecture/electron-desktop.md`).

Non-loopback bind requires `GNH_SIDECAR_TOKEN` at startup or the sidecar exits
(`holepunch-sidecar/src/server.mjs`).

## Hardening checklist (WebSocket — current and wss:// target)

Scheme change alone is not enough. Preserve the existing bridge API and enforce:

- Bind **only** `127.0.0.1` (and optionally `::1`); never default `0.0.0.0`.
- Fresh **ephemeral port** per sidecar launch (packaged: shipped).
- Fresh random **capability token** per launch; timing-safe verify on upgrade.
- **Single UI connection** unless multi-window is an explicit product requirement.
- **Origin allowlist** on WebSocket upgrade for browser/Electron renderer paths.
- Typed protocol messages; validate every field; strict **max payload** (shipped).
- **Rate limits**, timeouts, heartbeats, backpressure where applicable.
- **`permessage-deflate` disabled** unless explicitly reviewed (CRIME/BREACH class).
- L1 session seal: monotonic counters / replay rejection in AEAD envelopes (shipped).
- **Separate local-control keys** — never reuse Conceal, relationship, room,
  topic, or Hyperswarm session material at this boundary.

## wss:// certificate approach (planned)

Local-only sidecar — per-install or per-launch self-signed cert with **public-key
pinning in Electron main** (not public CA trust for `127.0.0.1`):

1. Sidecar generates or loads TLS key/cert in OS-protected app data.
2. Electron main holds expected cert SPKI / SHA-256 fingerprint from sidecar bootstrap.
3. Renderer connects only to `wss://127.0.0.1:<port>`.
4. Reject any certificate except the pinned sidecar cert (defeats port-race MITM).
5. Capability token auth **after** TLS upgrade (defense in depth).

This does not stop malware running as the user with access to app secrets; no
loopback transport fully addresses that threat model.

## When to prioritize IPC

Prefer Unix socket / named pipe when:

- Minimizing localhost attack surface matters more than encrypting it.
- All desktop targets are controlled and IPC plumbing is acceptable.
- Sidecar commands can route through Electron main without exposing generic
  control to the renderer sandbox.
- High-assurance desktop threat model is a product requirement.

Implementation keeps the **same** `SidecarCommand` / `SidecarEvent` schema
(`HolepunchSidecarClient.ts`); only the backend transport changes.

## Threat model reminder

| Adversary | Local bridge concern |
|---|---|
| Remote network attacker | **Out of scope** — bridge is loopback only |
| Local malware / other user | Can attempt loopback connect; mitigated by token + (future) wss/IPC |
| Compromised sidecar | Sees opaque frames + bridge metadata; **not** chat plaintext (L1 seal) |
| Misconfigured LAN bind | **Blocked** by token requirement off loopback; still forbidden for prod |

L1 ChaCha20-Poly1305 session seal remains mandatory regardless of `ws://` vs
`wss://` vs IPC.
