/**
 * WebView → RN bridge for ntfy SSE wake subscriptions (F-Droid only).
 * Sends postMessage commands to the React Native shell, which calls GnhNtfyWakeModule.
 */

import {
  isMobileAndroid,
  isMobileHost,
} from "@/lib/mobile/gnhMobileBridgeTypes";
import { NTFY_BASE_URL } from "@/lib/mobile/ntfyConfig";
import { listCatalogRooms } from "@/services/p2p/roomCatalogStore";
import { useSettingsStore } from "@/state/settingsStore";

function sendNtfyCommand(cmd: Record<string, string | undefined>): void {
  if (!isMobileHost()) return;
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ channel: "gnh-ntfy-wake", direction: "command", ...cmd }),
  );
}

/**
 * Subscribe a single room topic. topic = full ntfy URL e.g. https://ntfy.getnowhere.im/gnh-<pokeId>
 * No bearer token: the 80-bit `pokeId` in the topic name is the read capability.
 * @see docs/features/peer-wake-notification.md
 */
export function subscribeRoom(roomId: string, topic: string): void {
  sendNtfyCommand({ action: "subscribe", roomId, topic });
}

export function unsubscribeRoom(roomId: string): void {
  sendNtfyCommand({ action: "unsubscribeRoom", roomId });
}

export function unsubscribeAll(): void {
  sendNtfyCommand({ action: "unsubscribeAll" });
}

/** Subscribe all active rooms that have an ownPokeId. */
export function subscribeAll(): void {
  const rooms = listCatalogRooms();
  for (const room of rooms) {
    if (room.ownPokeId) {
      subscribeRoom(room.id, `${NTFY_BASE_URL}/gnh-${room.ownPokeId}`);
    }
  }
}

function androidWakeOn(): boolean {
  return (
    isMobileAndroid() && useSettingsStore.getState().privacy.pushWakeEnabled
  );
}

/** Open stored room listeners. Android only, and only while Wake is on. @see docs/features/peer-wake-notification.md */
export function resumeAndroidWakeSubscriptions(): void {
  if (!androidWakeOn()) return;
  subscribeAll();
}

/** Listen on one room handle. Android only, and only while Wake is on. @see docs/features/peer-wake-notification.md */
export function subscribeOwnRoomIfWake(
  roomId: string,
  ownPokeId: string,
): void {
  if (!ownPokeId || !androidWakeOn()) return;
  subscribeRoom(roomId, `${NTFY_BASE_URL}/gnh-${ownPokeId}`);
}
