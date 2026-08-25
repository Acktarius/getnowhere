/**
 * Client for the peer-wake poke gateway. Registers, sends, and removes
 * opaque pokeHandles; caches own handle in localStorage.
 * @see docs/features/peer-wake-notification.md
 */

const STORAGE_KEY = "gnh.ownPokeHandle";
const GATEWAY_URL = import.meta.env.VITE_POKE_GATEWAY_URL ?? "";

function gatewayUrl(): string {
  return GATEWAY_URL;
}

/** Returns the cached own pokeHandle, or null if none registered. */
export function getOwnPokeHandle(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

function saveOwnPokeHandle(handle: string): void {
  localStorage.setItem(STORAGE_KEY, handle);
}

function clearOwnPokeHandle(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Registers (or refreshes) the device's push token with the poke gateway.
 * Mints a new pokeHandle if none is cached; otherwise updates the token for
 * the existing handle (handles OS token rotation).
 *
 * @param platform - "apns"
 * @param deviceToken - raw OS push token
 * @returns the pokeHandle (14-char base64url) to share with peers
 */
export async function registerPokeHandle(
  platform: "apns",
  deviceToken: string,
): Promise<string> {
  const base = gatewayUrl();
  if (!base) throw new Error("VITE_POKE_GATEWAY_URL not configured");

  const existing = getOwnPokeHandle();
  const body: Record<string, string> = { platform, token: deviceToken };
  if (existing) body.pokeHandle = existing;

  const res = await fetch(`${base}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gateway /register failed: ${res.status}`);
  const json = (await res.json()) as { pokeHandle: string };
  saveOwnPokeHandle(json.pokeHandle);
  return json.pokeHandle;
}

/**
 * Sends an opaque poke to the peer identified by `partnerPokeHandle`.
 * No message content or sender identity is transmitted.
 */
export async function sendPoke(partnerPokeHandle: string): Promise<void> {
  const base = gatewayUrl();
  if (!base) return;

  const res = await fetch(`${base}/poke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: partnerPokeHandle }),
  });
  if (!res.ok) throw new Error(`Gateway /poke failed: ${res.status}`);
}

/**
 * Deletes own pokeHandle from the gateway and clears local storage.
 * Called when the user opts out of pushWakeEnabled.
 */
export async function deletePokeHandle(): Promise<void> {
  const handle = getOwnPokeHandle();
  if (!handle) return;
  const base = gatewayUrl();
  if (!base) {
    clearOwnPokeHandle();
    return;
  }
  try {
    await fetch(`${base}/register`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pokeHandle: handle }),
    });
  } finally {
    clearOwnPokeHandle();
  }
}
