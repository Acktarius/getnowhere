/**
 * Best-effort background remote-node sync handler (mobile WebView).
 * @see docs/background-remote-sync.md
 */
import { isAppAccessLocked } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  isSyncInProgress,
  isUnlocked,
  sync,
} from "@/services/conceal/sync/runtime";
import { scanAndPublishSyncNotifications } from "@/services/notifications/scanSyncNotifications";

export type BackgroundRemoteSyncOutcome =
  | "completed"
  | "no_change"
  | "skipped_in_progress"
  | "no_op"
  | "retryable"
  | "failure";

function postOutcome(requestId: string, outcome: BackgroundRemoteSyncOutcome) {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({
      channel: "gnh-background-sync",
      direction: "response",
      requestId,
      outcome,
    }),
  );
}

function mapSyncError(error: unknown): BackgroundRemoteSyncOutcome {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch") ||
    message.includes("econn") ||
    message.includes("socket")
  ) {
    return "retryable";
  }
  if (message.includes("not open") || message.includes("locked")) {
    return "no_op";
  }
  return "failure";
}

/** Invoked from native background refresh via injected gnhMobile hook. */
export async function runBackgroundRemoteSync(
  requestId: string,
): Promise<BackgroundRemoteSyncOutcome> {
  if (!isMobileHost()) {
    postOutcome(requestId, "no_op");
    return "no_op";
  }
  if (isAppAccessLocked() || !isUnlocked()) {
    postOutcome(requestId, "no_op");
    return "no_op";
  }
  if (isSyncInProgress()) {
    try {
      await scanAndPublishSyncNotifications();
    } catch {
      /* already-ingested events only; do not fail the skip */
    }
    postOutcome(requestId, "skipped_in_progress");
    return "skipped_in_progress";
  }
  try {
    await sync();
    // Best-effort: notification publish must never fail the sync outcome.
    try {
      const { useContactsStore } = await import("@/state/contactsStore");
      const { useChatStore } = await import("@/state/chatStore");
      await useContactsStore.getState().refreshInvites();
      await useChatStore.getState().refreshRelays();
      await scanAndPublishSyncNotifications();
    } catch {
      /* sync succeeded; skip notifications this round */
    }
    postOutcome(requestId, "completed");
    return "completed";
  } catch (error) {
    const outcome = mapSyncError(error);
    postOutcome(requestId, outcome);
    return outcome;
  }
}

/** Registers window.gnhMobile._runBackgroundRemoteSync for native inject. */
export function installBackgroundRemoteSyncHook(): void {
  if (!isMobileHost() || !window.gnhMobile) return;
  window.gnhMobile._runBackgroundRemoteSync = (requestId: string) => {
    void runBackgroundRemoteSync(requestId);
  };
}
