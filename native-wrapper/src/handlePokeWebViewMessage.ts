/** Route gnh-poke WebView commands (peer-wake token refresh). */

type PokeMessage = {
  channel?: string;
  direction?: string;
  action?: string;
};

export function parsePokeMessage(raw: string): PokeMessage | null {
  try {
    const msg = JSON.parse(raw) as PokeMessage;
    if (msg.channel !== "gnh-poke" || msg.direction !== "command") return null;
    if (typeof msg.action !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}

/** Returns true when the message was a poke command (handled). */
export function handlePokeWebViewMessage(
  raw: string,
  refreshToken: () => void,
): boolean {
  const msg = parsePokeMessage(raw);
  if (!msg) return false;
  if (msg.action === "refreshToken") {
    refreshToken();
    return true;
  }
  return true;
}
