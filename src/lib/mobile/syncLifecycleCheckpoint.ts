/**
 * Flush wallet sync + L2 transcripts when the app hides.
 * @see docs/background-remote-sync.md
 */
import { onAppAccessLifecycle } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { flushSyncCheckpoint } from "@/services/conceal/sync/runtime";
import { flushChatTranscriptsOnHide } from "@/services/p2p/HolepunchChatTransport";

/** Web tab hide / page teardown. No-op if document is unavailable. */
function installWebTranscriptFlush(): () => void {
  if (typeof document === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      void flushChatTranscriptsOnHide();
    }
  };
  const onPageHide = () => {
    void flushChatTranscriptsOnHide();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}

/** Subscribe to hide events and flush sync + transcripts. Returns unsubscribe. */
export function installSyncLifecycleCheckpoint(): () => void {
  if (!isMobileHost()) return installWebTranscriptFlush();
  return onAppAccessLifecycle((type) => {
    if (type === "background" || type === "screenOff") {
      void flushSyncCheckpoint();
      void flushChatTranscriptsOnHide();
    }
  });
}
