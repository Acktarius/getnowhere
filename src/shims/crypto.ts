/**
 * Shim for dependencies that `require("crypto")` in the browser bundle.
 * Delegates to Web Crypto — conceal-lib-js nacl prefers getRandomValues first.
 */

const webCrypto = globalThis.crypto;

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  webCrypto.getRandomValues(buf);
  return buf;
}

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  webCrypto.getRandomValues(array as Parameters<Crypto["getRandomValues"]>[0]);
  return array;
}

export default { randomBytes, getRandomValues };
