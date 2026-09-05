/** WebView ↔ RN wallet session keep-alive. @see docs/features/app-access-and-data-unlock.md */
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { useSettingsStore } from "@/state/settingsStore";

function post(body: Record<string, unknown>): void {
  if (!isMobileHost()) return;
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({
      channel: "gnh-wallet-session",
      direction: "command",
      ...body,
    }),
  );
}

export function keepNativeWalletSession(password: string): void {
  if (!isMobileHost() || !password) return;
  const autoLockTimeoutSec =
    useSettingsStore.getState().privacy.autoLockTimeoutSec;
  post({ action: "keep", password, autoLockTimeoutSec });
}

export function clearNativeWalletSession(): void {
  post({ action: "clear" });
}

export function syncNativeWalletSessionTimeout(): void {
  if (!isMobileHost()) return;
  post({
    action: "setTimeout",
    autoLockTimeoutSec: useSettingsStore.getState().privacy.autoLockTimeoutSec,
  });
}

export async function restoreWalletSessionIfPending(): Promise<boolean> {
  if (!isMobileHost()) return false;
  const deadline = Date.now() + 2000;
  while (!window.gnhMobile?._sessionRestoreReady && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 40));
  }
  const pw = window.gnhMobile?._pendingWalletRestore;
  if (window.gnhMobile) {
    window.gnhMobile._pendingWalletRestore = null;
  }
  if (typeof pw !== "string" || pw.length === 0) return false;
  const { useWalletStore } = await import("@/state/walletStore");
  await useWalletStore.getState().openStoredWallet(pw);
  return true;
}
