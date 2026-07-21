import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Web-app-first build, tuned for later embedding inside a minimal Expo
// React-Native WebView shell (iOS + Android). See the README section
// "Future Expo WebView Wrapper Notes" for the wrapping plan.
//
// WebView file:// compatibility (the three real blockers):
//   1. `base: "./"` → every asset reference is relative (./assets/…), so the
//      bundle works from a dev server, a subpath host, OR a bundled local
//      file:// path inside a WebView. Do NOT set `base: "/"`.
//   2. `build.rollupOptions.output.inlineDynamicImports` → no separate JS
//      chunks. Dynamic-import code-split chunks fail to load under file://
//      because module fetch is blocked on opaque file:// origins.
//   3. `build.assetsInlineLimit` raised → the Conceal SDK's WASM is inlined as
//      base64 data URLs instead of emitted as separate .wasm files. The SDK
//      loads WASM via `fetch(new URL('…_bg.wasm', import.meta.url))`, and
//      fetch() of a file:// URL is blocked in most WebViews. Inlining removes
//      the fetch entirely. ~228KB wasm → ~310KB base64, still well under the
//      4MB native-asset inline limit.
//
// `crossorigin` attributes on the entry script/CSS are removed at runtime by
// the `stripCrossOrigin` plugin below: under file:// the crossorigin attribute
// triggers a CORS check on an opaque origin, which fails and blocks the entry.
export default defineConfig(({ command }) => ({
  // `base: "./"` only for the production build — relative asset paths so the
  // static output loads from a bundled file:// path inside a WebView. In dev,
  // the Vite dev server needs an absolute base ("/") for module resolution.
  base: command === "build" ? "./" : "/",
  plugins: [react(), stripCrossOrigin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    assetsDir: "assets",
    // Inline all assets (including the SDK's WASM) as base64 data URLs so the
    // build is self-contained: no fetch() needed at runtime, which is required
    // for file:// loading inside a WebView. 4MB covers the ~228KB wasm modules
    // with headroom; raise only if a new binary asset exceeds this.
    assetsInlineLimit: 4_000_000,
    rollupOptions: {
      output: {
        // Force a single JS bundle — no dynamic-import chunks. Chunked
        // loading uses dynamic import(), which is blocked under file://.
        inlineDynamicImports: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["conceal-wallet-sdk", "conceal-lib-js"],
  },
}));

/**
 * Vite injects `crossorigin` onto the entry `<script type="module">` and CSS
 * `<link>` during HTML generation. Under `file://` (bundled WebView assets),
 * `crossorigin` forces a CORS check against an opaque origin, which fails and
 * blocks the entry from executing. This plugin strips those attributes from
 * the generated index.html so the entry loads cleanly from file://. On a
 * normal https origin the attributes are unnecessary for same-origin assets.
 */
function stripCrossOrigin() {
  return {
    name: "strip-crossorigin-for-file-protocol",
    apply: "build" as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/ crossorigin(?=["'\s/>])/gi, "")
        .replace(/\s+crossorigin=/gi, "");
    },
  };
}
