/**
 * Shared chat send / composer gate.
 * Invite `accepted` is NOT enough — Holepunch room must be `connected`.
 */

import { canSendLiveMessages } from "@/services/protocol/roomLifecycle";
import type { RoomLifecycleStatus } from "@/types/models";

export const COMPOSER_DISABLED_REASON: Record<
  Exclude<RoomLifecycleStatus, "connected">,
  string
> = {
  pending: "Waiting for invite accept — chat is not live yet.",
  accepted: "Invite accepted — connecting to peer (Holepunch).",
  connecting: "Holepunch connecting…",
  connect_failed: "Peer connection failed — retry to enable messaging.",
  declined: "Invite declined — room closed.",
  expired: "Room expired.",
  failed: "Room failed.",
  closed: "Room closed.",
  destroyed: "Room destroyed.",
};

export function isComposerEnabled(status: RoomLifecycleStatus): boolean {
  return canSendLiveMessages(status);
}

export function composerDisabledReason(
  status: RoomLifecycleStatus,
): string | null {
  if (status === "connected") return null;
  return COMPOSER_DISABLED_REASON[status];
}

export function assertCanSendLive(status: RoomLifecycleStatus): void {
  if (!canSendLiveMessages(status)) {
    throw new Error(
      composerDisabledReason(status) ??
        "Cannot send until Holepunch-connected.",
    );
  }
}
