/**
 * Worklet argv helpers — token from worklet.start(..., [token]).
 * @see docs/architecture/mobile-p2p-runtime.md
 */

/**
 * @param {{ Bare?: { argv?: string[] }, BareKit?: { argv?: string[] } }} [env]
 * @returns {string}
 */
export function readBridgeTokenFromArgv(env = globalThis) {
  const token = env.Bare?.argv?.[0] ?? env.BareKit?.argv?.[0] ?? "";
  return typeof token === "string" ? token : "";
}

/**
 * @param {{ Bare?: { argv?: string[] }, BareKit?: { argv?: string[] } }} [env]
 * @returns {string}
 */
export function requireBridgeTokenFromArgv(env = globalThis) {
  const token = readBridgeTokenFromArgv(env);
  if (!token) {
    throw new Error("bridge token required");
  }
  return token;
}
