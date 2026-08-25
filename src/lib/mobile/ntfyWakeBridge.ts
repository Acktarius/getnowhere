/**
 * WebView → RN bridge for ntfy SSE wake subscriptions (F-Droid only).
 * Sends postMessage commands to the React Native shell, which calls GnhNtfyWakeModule.
 */

import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { NTFY_BASE_URL } from "@/lib/mobile/ntfyConfig";
import { listCatalogRooms } from "@/services/p2p/roomCatalogStore";

function sendNtfyCommand(cmd: Record<string, string | undefined>): void {
  if (!isMobileHost()) return;
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ channel: "gnh-ntfy-wake", direction: "command", ...cmd }),
  );
}

/** Subscribe a single room topic. topic = full ntfy URL e.g. https://ntfy.getnowhere.im/gnh-<pokeId> */
export function subscribeRoom(
  roomId: string,
  topic: string,
  token?: string,
): void {
  sendNtfyCommand({ action: "subscribe", roomId, topic, token });
}

export function unsubscribeRoom(roomId: string): void {
  sendNtfyCommand({ action: "unsubscribeRoom", roomId });
}

export function unsubscribeAll(): void {
  sendNtfyCommand({ action: "unsubscribeAll" });
}

/** Subscribe all active rooms that have an ownPokeId. */
export function subscribeAll(token?: string): void {
  const readToken = token ?? import.meta.env?.VITE_NTFY_READ_TOKEN ?? "";
  const rooms = listCatalogRooms();
  for (const room of rooms) {
    if (room.ownPokeId) {
      subscribeRoom(
        room.id,
        `${NTFY_BASE_URL}/gnh-${room.ownPokeId}`,
        readToken || undefined,
      );
    }
  }
}
