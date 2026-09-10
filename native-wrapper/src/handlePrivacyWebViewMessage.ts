/**
 * Route gnh-privacy WebView events and clipboard commands.
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */

export type PrivacyBlurHandler = (enabled: boolean) => void;

export type PrivacyClipboardHandlers = {
  copySensitive: (value: string) => Promise<void>;
  clearClipboard: () => Promise<void>;
  resolve: (response: Record<string, unknown>) => void;
};

type IncomingMessage = {
  channel?: string;
  direction?: string;
  type?: string;
  enabled?: boolean;
  requestId?: string;
  lockGeneration?: number;
  action?: string;
  value?: string;
};

function buildResponse(
  msg: IncomingMessage,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    channel: msg.channel,
    direction: "response",
    requestId: msg.requestId,
    lockGeneration: msg.lockGeneration ?? 0,
    ...body,
  };
}

/** Returns true when the message was handled. */
export function handlePrivacyWebViewMessage(
  raw: string,
  onBlurInAppSwitcher: PrivacyBlurHandler,
  clipboard?: PrivacyClipboardHandlers,
): boolean {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw) as IncomingMessage;
  } catch {
    return false;
  }
  if (msg.channel !== "gnh-privacy") return false;

  if (msg.direction === "event") {
    if (msg.type !== "setBlurInAppSwitcher") return false;
    onBlurInAppSwitcher(Boolean(msg.enabled));
    return true;
  }

  if (msg.direction !== "command" || !msg.requestId || !clipboard) {
    return false;
  }

  void (async () => {
    try {
      if (msg.action === "copySensitive") {
        if (typeof msg.value !== "string") {
          clipboard.resolve(buildResponse(msg, { error: "failed" }));
          return;
        }
        await clipboard.copySensitive(msg.value);
        clipboard.resolve(buildResponse(msg, { ok: true }));
        return;
      }
      if (msg.action === "clearClipboard") {
        await clipboard.clearClipboard();
        clipboard.resolve(buildResponse(msg, { ok: true }));
        return;
      }
      clipboard.resolve(buildResponse(msg, { error: "failed" }));
    } catch {
      clipboard.resolve(buildResponse(msg, { error: "failed" }));
    }
  })();
  return true;
}
