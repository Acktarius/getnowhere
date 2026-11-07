/** Keyboard frame overlap with the iOS window, in CSS pixels. */
export function iosKeyboardOverlapPx(
  windowHeight: number,
  end: { height: number; screenY: number },
): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
  const height = Number.isFinite(end.height) ? end.height : 0;
  const screenY = Number.isFinite(end.screenY) ? end.screenY : windowHeight;
  return Math.max(0, Math.round(Math.min(height, windowHeight - screenY)));
}

/** WebView asks the shell to resign the keyboard (replaces the form-accessory checkmark). */
export function isIosKeyboardDismissMessage(raw: string): boolean {
  try {
    const msg = JSON.parse(raw) as { channel?: string; action?: string };
    return msg.channel === "gnh-keyboard" && msg.action === "dismiss";
  } catch {
    return false;
  }
}

/** Inject the iOS keyboard overlap into the WebView. Ends with `true` for WKWebView. */
export function iosKeyboardInsetScript(heightPx: number): string {
  const height = Math.max(
    0,
    Math.round(Number.isFinite(heightPx) ? heightPx : 0),
  );
  return `window.__gnhIosKeyboardHeight=${height};window.dispatchEvent(new CustomEvent("gnh-ios-keyboard",{detail:${height}}));true;`;
}
