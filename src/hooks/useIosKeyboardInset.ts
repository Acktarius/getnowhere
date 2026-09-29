import { useEffect, useState } from "react";

const EVENT = "gnh-ios-keyboard";

/** Ask the iOS shell to dismiss the keyboard. Blur alone is unreliable in WKWebView. */
export function dismissIosKeyboard(): void {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ channel: "gnh-keyboard", action: "dismiss" }),
  );
}

type IosKeyboardWindow = Window & { __gnhIosKeyboardHeight?: number };

function readInjectedHeight(): number | null {
  if (typeof window === "undefined") return null;
  const value = (window as IosKeyboardWindow).__gnhIosKeyboardHeight;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

/**
 * Keyboard overlap injected by the iOS shell (`keyboardWillChangeFrame`).
 * `null` until the shell reports a frame — callers keep the visual-viewport fallback.
 * @see docs/architecture/web-vs-wrapper.md
 */
export function useIosKeyboardInset(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(() =>
    enabled ? readInjectedHeight() : null,
  );

  useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }
    const apply = (value: unknown) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      setHeight(Math.max(0, value));
    };
    apply(readInjectedHeight());
    const onFrame = (event: Event) => {
      apply((event as CustomEvent<number>).detail);
    };
    window.addEventListener(EVENT, onFrame);
    return () => window.removeEventListener(EVENT, onFrame);
  }, [enabled]);

  return height;
}
