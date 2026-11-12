/**
 * After iOS unlock, rejoin each saved topic once. HKDF inputs stay on the session.
 * @see docs/security/capabilities-and-derivation.md
 */
import {
  isAppAccessLocked,
  onAppAccessLifecycle,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost, isMobileIos } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  HolepunchChatTransport,
  hasLiveRejoinContract,
  listLiveRoomIds,
  restoreRoomSession,
} from "@/services/p2p/HolepunchChatTransport";
import { reusableSessionBlock } from "@/services/p2p/reusableSession";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import {
  listRoomSessionIds,
  loadRoomSession,
} from "@/services/p2p/roomSessionStore";

const WORKLET_RECOVER_MS = 1_500;

let rejoinInFlight: Promise<void> | null = null;

/** Ask the native shell to restart Bare after an iOS suspend. No-op elsewhere. */
export function requestIosWorkletRecover(): Promise<void> {
  if (!isMobileIos()) return Promise.resolve();
  const bridge = window.gnhMobile;
  if (!bridge?.sendCommand || !bridge.onBridgeEvent) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, WORKLET_RECOVER_MS);
    const off = bridge.onBridgeEvent?.((msg) => {
      if (msg.type === "pong" || msg.type === "ready") finish();
    });
    function finish() {
      window.clearTimeout(timer);
      off?.();
      resolve();
    }
    try {
      bridge.sendCommand({ type: "recover-worklet" });
    } catch {
      finish();
    }
  });
}

/**
 * Rejoin stored topics once. A locked gate defers. Does not derive a new topic.
 */
export function rejoinSavedRoomsAfterUnlock(): Promise<void> {
  if (!isMobileHost() || isAppAccessLocked()) return Promise.resolve();
  if (rejoinInFlight) return rejoinInFlight;
  rejoinInFlight = runRejoin().finally(() => {
    rejoinInFlight = null;
  });
  return rejoinInFlight;
}

async function runRejoin(): Promise<void> {
  await requestIosWorkletRecover();
  if (isAppAccessLocked()) return;
  const ids = new Set<string>([...listRoomSessionIds(), ...listLiveRoomIds()]);
  for (const roomId of ids) {
    if (isAppAccessLocked()) return;
    if (isRoomRevoked(roomId)) continue;
    const saved = loadRoomSession(roomId);
    const block = reusableSessionBlock(saved);
    if (block === "unsupported") continue;
    if (block !== "ok" && !hasLiveRejoinContract(roomId)) continue;
    const live = await HolepunchChatTransport.getRoom(roomId);
    if (live?.lifecycleStatus === "connected") continue;
    try {
      await restoreRoomSession(roomId);
    } catch {
      /* next foreground tries again */
    }
  }
}

/** Foreground rejoin when the gate is already open. Unlock calls the same helper. */
export function installForegroundRoomRejoin(): () => void {
  if (!isMobileHost()) return () => {};
  return onAppAccessLifecycle((type) => {
    if (type !== "foreground" || isAppAccessLocked()) return;
    void rejoinSavedRoomsAfterUnlock();
  });
}
