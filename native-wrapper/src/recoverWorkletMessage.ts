/** WebView command asking the shell to restart the Bare worklet after iOS suspend. */

export function parseRecoverWorkletCommand(
  raw: string,
): { token: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const msg = parsed as Record<string, unknown>;
  if (msg.channel !== "gnh-bridge" || msg.direction !== "command") return null;
  if (msg.type !== "recover-worklet") return null;
  return { token: typeof msg.token === "string" ? msg.token : "" };
}
