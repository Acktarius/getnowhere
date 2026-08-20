/**
 * Shared chat send / composer gate.
 * Live = Holepunch `connected`; L1 relay = post-accept (not pending).
 * @see docs/security/p2pchatprotocol.md §9 / §16
 */

import { assertAppAccessUnlocked } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  canSendLiveMessages,
  canSendMessages,
  isRelayEligibleStatus,
  preferredChannel,
} from "@/services/protocol/roomLifecycle";
import type { MessageChannel, RoomLifecycleStatus } from "@/types/models";
import type { ConnectFailureCode } from "@/types/protocol";

const COMPOSER_DISABLED_REASON: Record<
  Exclude<RoomLifecycleStatus, "connected">,
  string
> = {
  pending: "Waiting for invite accept — messaging not allowed yet.",
  accepted: "Invite accepted — Holepunch connecting to peer.",
  connecting: "Holepunch connecting…",
  connect_failed:
    "Holepunch connection failed — retry, or messages still send via chain fallback.",
  declined: "Invite declined — room closed.",
  expired: "Room expired.",
  failed: "Room failed.",
  closed: "Room closed.",
  destroyed: "Room destroyed.",
};

const CONNECT_ERROR_HINT: Record<ConnectFailureCode, string> = {
  timeout:
    "No peer on topic within timeout (DHT slow, wrong topic, or isolated swarms not meeting).",
  unreachable:
    "Holepunch bridge offline or unauthorized (shared Alice/Bob token mismatch?).",
  crypto_mismatch:
    "Peer reached topic but L1 proof failed (session keys do not match — resend invite).",
  aborted: "Connect aborted.",
  expired: "Room TTL expired during connect.",
  unknown: "Unknown connect failure.",
};

/** @deprecated Prefer canSendLiveMessages(status) or assertCanSendLive(status) for live-only checks. */
export function isComposerEnabled(status: RoomLifecycleStatus): boolean {
  return canSendLiveMessages(status);
}

export function canComposeMessages(status: RoomLifecycleStatus): boolean {
  return canSendMessages(status);
}

export function composerPreferredChannel(
  status: RoomLifecycleStatus,
): MessageChannel {
  return preferredChannel(status);
}

export function connectFailureHint(code: string | undefined): string | null {
  if (!code) return null;
  if (code in CONNECT_ERROR_HINT) {
    return CONNECT_ERROR_HINT[code as ConnectFailureCode];
  }
  return `Connect error: ${code}`;
}

export function composerDisabledReason(
  status: RoomLifecycleStatus,
  lastConnectError?: string,
  awaitingChainSync?: boolean,
): string | null {
  if (awaitingChainSync) {
    return "Wallet syncing — room will enable when near chain tip.";
  }
  if (canComposeMessages(status)) return null;
  if (status === "connected") return null;
  if (status === "connect_failed") {
    return (
      connectFailureHint(lastConnectError) ??
      COMPOSER_DISABLED_REASON.connect_failed
    );
  }
  return COMPOSER_DISABLED_REASON[status];
}

export function assertCanSendLive(status: RoomLifecycleStatus): void {
  if (!canSendLiveMessages(status)) {
    throw new Error(
      composerDisabledReason(status) ??
        "Cannot send live until Holepunch-connected.",
    );
  }
}

export function assertCanSendMessages(status: RoomLifecycleStatus): void {
  if (isMobileHost()) assertAppAccessUnlocked();
  if (!canComposeMessages(status)) {
    throw new Error(
      composerDisabledReason(status) ??
        "Cannot send until invite accepted (pending blocks relay).",
    );
  }
}

export function assertRoomInteractive(
  status: RoomLifecycleStatus,
  awaitingChainSync?: boolean,
): void {
  if (awaitingChainSync) {
    throw new Error(composerDisabledReason(status, undefined, true)!);
  }
}

export {
  canSendLiveMessages,
  canSendMessages,
  isRelayEligibleStatus,
  preferredChannel,
};
