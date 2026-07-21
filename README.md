# getnowhere

A web-app-first Conceal (CCX) wallet and private-relationship client. Built with
React + TypeScript + Vite and developed entirely in the browser.

## Local development

```bash
npm install
npm run dev      # start the Vite dev server (http://localhost:5173)
npm run build    # produce a static build in dist/
npm run preview  # serve the static build locally for verification
```

No native toolchain is required for development or for the production web build.

## Future Expo WebView Wrapper Notes

This project is a **web app first**. It is not an Expo or React Native app, and
no native code lives in this repository. The goal is to keep the web app fully
usable in a browser while making the production static build easy to embed
later inside a minimal Expo React Native WebView shell for iOS and Android.

### Web app first

- Develop and verify everything with `npm run dev` in a browser.
- Ship the web build with `npm run build` (static output in `dist/`).
- Native build and store submission will be handled **separately** with
  EAS Build / EAS Submit inside a dedicated, minimal Expo repository that wraps
  this build output in a WebView. That wrapper repo is not part of this project.

### What the Expo shell will do

- Load the static build output (`dist/`) as bundled local assets inside a
  `react-native-webview` component (e.g. via `expo-asset` or a bundled folder),
  OR host `dist/` and point the WebView at the URL for over-the-air updates.
- For local bundled assets, the WebView loads from a `file://` or local asset
  path, so all asset references in the build are **relative** (see Vite config
  `base: "./"`). Do not host the build from a server root inside the shell.
- Routing uses `HashRouter`, so deep links work without server rewrite rules
  and from a bundled local path. No `BrowserRouter` server config is needed.

### Config: local bundled assets vs. hosted assets

- **Local bundled (default for offline-first):** copy `dist/` into the Expo
  app's assets and load `index.html` via WebView. Relative `base: "./"` ensures
  `./assets/*.js` and `./assets/*.css` resolve from the bundle.
- **Hosted (for OTA updates):** deploy `dist/` to any static host and point the
  WebView at the URL. Relative paths still work at any subpath; no root-host
  assumption. To pin to an absolute origin, override `base` at build time only
  if you control that origin.

### file:// compatibility (what the build does for you)

The Vite config is specifically tuned so the production build loads from a
`file://` URL inside a WebView, not just from an https origin. Three blockers
are handled:

1. **Relative asset paths** — `base: "./"` makes every reference `./assets/…`
   so it resolves next to `index.html` regardless of origin.
2. **No dynamic-import chunks** — `inlineDynamicImports: true` forces a single
   JS bundle. Code-split chunks load via dynamic `import()`, which is blocked
   under `file://` (module fetch fails on opaque file origins).
3. **Inlined WASM** — `assetsInlineLimit: 4_000_000` inlines the Conceal SDK's
   `.wasm` modules as base64 data URLs inside the JS bundle. The SDK otherwise
   loads WASM via `fetch(new URL('…_bg.wasm', import.meta.url))`, and `fetch()`
   of a `file://` URL is blocked in most WebViews. Inlining removes the fetch
   entirely.
4. **No `crossorigin` on entry assets** — a build-only plugin strips the
   `crossorigin` attribute Vite adds to the entry `<script>`/`<link>`. Under
   `file://`, `crossorigin` triggers a CORS check on an opaque origin, which
   fails and blocks the entry from executing.

Result: `dist/` is self-contained (one JS file + one CSS file, both with
relative paths) and can be loaded directly from a bundled local path. Verify
after any config change that `dist/index.html` has no `crossorigin` and that
no separate `.wasm` files are emitted.

### Storage adapters to replace with native secure storage

The app persists **only** through the `StorageAdapter` interface in
`src/services/storage/StorageAdapter.ts`. It never calls `localStorage`
directly. The default `webStorageAdapter` (localStorage) is for browser/dev
use only.

Before shipping inside Expo, inject a native-backed adapter before the React
tree mounts so secrets never sit in WebView localStorage:

```ts
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
// nativeSecureStorage implements StorageAdapter via a bridge to Keychain /
// EncryptedSharedPreferences
setActiveStorageAdapter(nativeSecureStorage);
```

Secrets and sensitive state that must move to native secure storage:

- **App passcode** — `src/services/mock/MockLocalSecurityAdapter.ts` (today
  in-memory only; the native adapter should back the passcode verify/set via
  the `LocalSecurityService` seam).
- **Wallet envelope / serialized wallet state** — the Conceal SDK wallet blob
  and `serializeWalletState` output. Today held in-memory by the wallet
  adapter; a native shell should persist these through the secure adapter.
- **Seed phrase** — held only in-memory and never persisted; keep it that way
  and never route it through any storage adapter.

Non-secret data (theme/accent/onboarding flag) can stay in a shared-prefs-style
adapter; it does not require Keychain-grade storage.

### Safe runtime assumptions inside a WebView

- Single WebView, single tab. No popups, no `window.open`, no multi-tab flows,
  no browser-extension-wallet assumptions.
- No service-worker dependency for core behavior.
- Crypto runs in-browser via WASM (Conceal SDK) — works inside a WebView.
- Network calls (daemon RPC) go to public Conceal nodes over HTTPS; a native
  shell can add an `origin`/ATS allow-list if needed.

### What NOT to do in the web app

- Do not introduce Capacitor / Cordova / Expo / React Native dependencies here.
- Do not add server-side rendering or a backend server; the build is static.
- Do not rely on desktop-only browser APIs for core flows.
