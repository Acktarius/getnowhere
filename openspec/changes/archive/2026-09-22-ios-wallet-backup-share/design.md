## Context

See proposal.md — Why. Today `native-wrapper/src/saveTextFileFromWebView.ts`
always uses `StorageAccessFramework` (Android-only). The Web UI already
routes Backup download through `window.gnhMobile.saveTextFile` /
`gnh-file`. `expo-sharing` is already a dependency and Expo plugin.

## Goals / Non-Goals

**Goals:**

- Platform-branch the existing save handler so iOS exports via share sheet.
- Keep Android SAF behavior and the `gnh-file` contract unchanged.
- Cover the branch with mocked unit tests; document iOS share-sheet UX.

**Non-Goals:**

- Unify Android onto share sheet.
- Enable iOS Documents browser file-sharing entitlement.
- Change Backup UI copy, passwords, or QR export.
- Alter bridge message schema or `downloadJson` API.

## Decisions

1. **Branch in one module** (`saveTextFileFromWebView.ts`) rather than
   `.ios.ts` / `.android.ts` splits — small helper; one place to audit.
2. **iOS: cache file + `Sharing.shareAsync`** with
   `mimeType: "application/json"` and `UTI: "public.json"` — Expo-recommended
   export pattern; temp file under `Paths.cache` with best-effort cleanup.
3. **Cancel / unavailable → `ok: false`** — same WebView promise rejection
   path Android uses for “Save cancelled”.
4. **No new native deps** — use existing `expo-sharing` / `expo-file-system`.

**Alternatives considered:** platform extension files (more scaffolding);
share sheet on both platforms (regresses Android folder pick); Documents
directory only (no destination picker).

## Risks / Trade-offs

- [Share sheet dismiss semantics vary by OS version] → Treat thrown / rejected
  share as failure; success only when `shareAsync` resolves.
- [Temp JSON remains in cache if cleanup fails] → Best-effort delete after
  settle; cache is app-private.
- [Operator may share instead of Save to Files] → Acceptable for an export;
  content is already password-encrypted wallet envelope from Backup UI.

## Migration Plan

- Ship in next iOS build that includes the updated native wrapper source.
- No data migration. Rollback = previous build (Android unaffected).
- Verify on device: Settings → Backup → Download → share sheet → Save to Files.

## Open Questions

None.
