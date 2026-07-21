/**
 * One-time SDK readiness gate.
 *
 * In the BROWSER build, conceal-lib-js resolves to its browser entry, which loads
 * the crypto/cypher WASM ASYNCHRONOUSLY. Any crypto call before that module is
 * initialized throws `Cannot read properties of undefined (reading
 * '__wbindgen_malloc')`. The SDK exposes `init()` (v0.1.1+) to await that load;
 * it is memoized + idempotent and a no-op in Node (where WASM auto-inits, which is
 * why the unit tests passed without it).
 *
 * {@link ensureSdkReady} MUST be awaited before the FIRST conceal-wallet-sdk crypto
 * call in any code path (createAccount/generateKeys, scanReceiveOutputs, key
 * derivation, ring signatures, …). The pure-JS secretbox/base58 don't strictly
 * need it, but the gate is cheap once warm so every service entry point awaits it.
 *
 * Forward-compatible: written against the v0.1.1 `init` export but resolves it
 * defensively off the module namespace, so it compiles + runs against the
 * currently-installed v0.1.0 (no `init`) too — there it simply no-ops.
 */
import * as sdk from "conceal-wallet-sdk";

/** The SDK's async WASM initializer, when the installed version exports one. */
type SdkInit = () => void | Promise<void>;

/** Read `init` off the SDK namespace without a named import the older dts lacks. */
function resolveInit(): SdkInit | null {
  const candidate = (sdk as Record<string, unknown>).init;
  return typeof candidate === "function" ? (candidate as SdkInit) : null;
}

/** Memoized readiness promise — `init()` runs at most once. */
let readyPromise: Promise<void> | null = null;

/**
 * Resolve once the SDK's WASM crypto is initialized and safe to call. Memoized:
 * the first call triggers `init()`; every later call returns the same settled
 * promise instantly. A no-op (resolved promise) when the SDK exports no `init`
 * (older version) or in Node where WASM is already loaded.
 */
export function ensureSdkReady(): Promise<void> {
  if (readyPromise === null) {
    const init = resolveInit();
    readyPromise =
      init === null
        ? Promise.resolve()
        : Promise.resolve(init()).then(() => undefined);
    // If init() rejects, clear the memo so a later call can retry rather than
    // permanently wedging the engine on a transient WASM-load failure.
    readyPromise.catch(() => {
      readyPromise = null;
    });
  }
  return readyPromise;
}

/** Test-only reset of the memoized readiness promise. */
export function _resetSdkReady(): void {
  readyPromise = null;
}
