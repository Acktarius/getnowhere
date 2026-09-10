# gnhMobile security bridge contract

Mobile-only channels for app access, data unlock, secure prefs, and lifecycle.
WebView loads bundled Vite UI; native Expo shell routes `postMessage` JSON.

**Related:** `docs/features/app-access-and-data-unlock.md`, OpenSpec change
`mobile-app-access-data-unlock`, archived `mobile-bridge-hardening`.

## Trust boundary

- Allowed origins: bundled asset URIs only (`file:///android_asset/ui/…`, iOS
  equivalent). No universal access, no iframe callers.
- Bridge token for P2P (`gnh-bridge`) stays in injection closure — not on
  `window.gnhMobile`.
- **Lock generation:** monotonic integer incremented on each app-access lock.
  Native and JS include `lockGeneration` on biometric requests; stale responses
  are discarded when `response.lockGeneration !== current`.
- **Single in-flight biometric:** native shell rejects a second prompt while one
  is active.
- **Locked-state reject:** while app access is locked, reject `gnh-bridge`
  commands and biometric enroll except unlock/lifecycle/securePrefs reads needed
  for unlock.

## Message envelope

All security channels use:

```json
{
  "channel": "<channel-id>",
  "direction": "command" | "response" | "event",
  "requestId": "<uuid>",
  "lockGeneration": 0
}
```

`requestId` correlates command ↔ response. `lockGeneration` optional on
lifecycle events; required on biometric commands/responses.

## Channels

### `gnh-lifecycle` (native → WebView events)

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"foreground"` \| `"background"` \| `"screenOff"` | From AppState / screen |

Injected via `_dispatchLifecycleEvent`. No response.

### `gnh-biometric` (WebView ↔ native)

**Commands** (`direction: "command"`):

| `action` | Payload | Response |
|----------|---------|----------|
| `isAvailable` | `{ purpose: "app" \| "data" }` | `{ available: boolean }` |
| `enrollDataUnlock` | `{ walletId, password }` | `{ credentialId }` or `{ error }` |
| `unlockDataUnlock` | `{ walletId, credentialId }` | `{ password }` or `{ error }` |
| `enrollAppAccess` | `{ passcode }` | `{ credentialId }` or `{ error }` |
| `unlockAppAccess` | — | `{ ok: true }` or `{ error }` |
| `removeCredential` | `{ credentialId }` | `{ ok: true }` |

**Native-only decrypt:** Keystore/Keychain secrets never cross the bridge.
`unlockDataUnlock` returns wallet password only after biometric success.

**Errors:** `unsupported`, `cancelled`, `invalidated`, `locked`, `busy`, `failed`.

### `gnh-secure-prefs` (WebView ↔ native)

| `action` | Payload | Response |
|----------|---------|----------|
| `get` | `{ key }` | `{ value: string \| null }` |
| `set` | `{ key, value }` | `{ ok: true }` |
| `remove` | `{ key }` | `{ ok: true }` |

Values are JSON strings. Used for enrollment envelopes and app passcode hash —
not WebView `localStorage` on device.

### `gnh-privacy` (WebView → native events and commands)

| `type` | Payload | Notes |
|--------|---------|-------|
| `setBlurInAppSwitcher` | `{ enabled: boolean }` | Native shell covers the WebView on `inactive`/`background` so iOS app-switcher snapshots stay obscure. Android also uses activity `FLAG_SECURE`. |

Injected as `gnhMobile.setBlurInAppSwitcher(enabled)`. Event only; no response.

**Commands** (`direction: "command"`), injected as `gnhMobile.copySensitive` /
`gnhMobile.clearClipboard`. Native MUST NOT log `value`. Responses use
`_resolveSecurity` and never echo the identifier.

| `action` | Payload | Response |
|----------|---------|----------|
| `copySensitive` | `{ value }` | `{ ok: true }` or `{ error: "failed" }` |
| `clearClipboard` | — | `{ ok: true }` or `{ error: "failed" }` |

Android writes `setPrimaryClip` + `EXTRA_IS_SENSITIVE` and clears with
`clearPrimaryClip()`. iOS writes `UIPasteboard.setItems` with `localOnly` and
60s `expirationDate`, and clears by emptying the pasteboard.

@see docs/security/clipboard.md

## JS types

Shared TS definitions: `src/lib/mobile/gnhMobileBridgeTypes.ts`.

## App access lock generation (WebView)

`AppAccessController` (`src/lib/mobile/AppAccessController.ts`) owns:

- `lockGeneration` — increment on every lock
- Idle timer from `autoLockTimeoutSec`
- Lifecycle subscription via `gnhMobile.onLifecycle`
- `assertUnlocked()` / `isSensitiveActionAllowed()` for gating wallet/chat UI

Wallet runtime is **not** unmounted on app-access lock.
