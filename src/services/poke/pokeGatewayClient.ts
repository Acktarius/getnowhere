/**
 * Client for the peer-wake poke gateway. Registers, sends, and removes
 * opaque pokeHandles; caches own handle in localStorage.
 * @see docs/features/peer-wake-notification.md
 */

const STORAGE_KEY = "gnh.ownPokeHandle";

function gatewayUrl(): string {
  return import.meta.env.VITE_POKE_GATEWAY_URL ?? "";
}

/** EAS ad-hoc / TestFlight / App Store share the Production APNs key. */
export function apnsPushEnv(): "sandbox" | "production" {
  return "production";
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

/** Gateway `/register` body — `env` is required or APNs is never stored. */
export function buildPokeRegisterBody(
  platform: "apns",
  deviceToken: string,
  existingHandle: string | null,
): Record<string, string> {
  const body: Record<string, string> = {
    platform,
    token: deviceToken,
    env: apnsPushEnv(),
  };
  if (existingHandle) body.pokeHandle = existingHandle;
  return body;
}

/** Register or refresh the APNs token. Returns the pokeHandle to share with peers. */
export async function registerPokeHandle(
  platform: "apns",
  deviceToken: string,
): Promise<string> {
  const base = gatewayUrl();
  if (!base) throw new Error("VITE_POKE_GATEWAY_URL not configured");

  const body = buildPokeRegisterBody(platform, deviceToken, getOwnPokeHandle());

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
