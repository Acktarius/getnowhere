/**
 * Flush in-flight wallet sync to disk when the app backgrounds (iOS WebView suspend).
 * @see docs/background-remote-sync.md
 */
import { onAppAccessLifecycle } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { flushSyncCheckpoint } from "@/services/conceal/sync/runtime";

/** Subscribe to lifecycle events and flush sync progress on background/screenOff. Returns unsubscribe. */
export function installSyncLifecycleCheckpoint(): () => void {
  if (!isMobileHost()) return () => {};
  return onAppAccessLifecycle((type) => {
    if (type === "background" || type === "screenOff") {
      void flushSyncCheckpoint();
    }
  });
}
