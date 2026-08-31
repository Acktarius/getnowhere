/**
 * Route gnh-privacy WebView events (app-switcher obscure preference).
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */

export type PrivacyBlurHandler = (enabled: boolean) => void;

type IncomingMessage = {
  channel?: string;
  direction?: string;
  type?: string;
  enabled?: boolean;
};

/** Returns true when the message was handled. */
export function handlePrivacyWebViewMessage(
  raw: string,
  onBlurInAppSwitcher: PrivacyBlurHandler,
): boolean {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw) as IncomingMessage;
  } catch {
    return false;
  }
  if (msg.channel !== "gnh-privacy" || msg.direction !== "event") {
    return false;
  }
  if (msg.type !== "setBlurInAppSwitcher") return false;
  onBlurInAppSwitcher(Boolean(msg.enabled));
  return true;
}
