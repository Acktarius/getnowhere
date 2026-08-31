/**
 * Pure room lifecycle transitions + TTL helpers.
 * Live = `connected`; L1 relay = post-accept (not pending).
 * @see docs/security/p2pchatprotocol.md §9 / §16
 */

import {
  L2_RECENT_LIVE_HOLD_MS,
  L2_RECONNECT_GRACE_MS,
} from "@/services/p2p/holepunchPolicy";
import type { RoomLifecycleStatus } from "@/types/models";

const CLOCK_SKEW_SEC = 120;

export function nowUnix(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000);
}

export function isWithinSkew(
  timestampUnix: number,
  nowSec = nowUnix(),
  skewSec = CLOCK_SKEW_SEC,
): boolean {
  return (
    Math.abs(nowSec - timestampUnix) <= skewSec ||
    timestampUnix >= nowSec - skewSec
  );
}

export function isInviteExpired(
  inviteExpiry: number,
  nowSec = nowUnix(),
  skewSec = CLOCK_SKEW_SEC,
): boolean {
  return nowSec > inviteExpiry + skewSec;
}

export function isRoomExpired(
  roomTtl: number,
  nowSec = nowUnix(),
  skewSec = CLOCK_SKEW_SEC,
): boolean {
  return nowSec > roomTtl + skewSec;
}

export function canSendLiveMessages(status: RoomLifecycleStatus): boolean {
  return status === "connected";
}

/** Post-accept only — never pending (avoids spam before invitee accepts). */
export function isRelayEligibleStatus(status: RoomLifecycleStatus): boolean {
  return (
    status === "accepted" ||
    status === "connecting" ||
    status === "connect_failed"
  );
}

/** Post-L2 disconnect blip — not pre-connect `accepted`. */
export function isTransientL2Blip(status: RoomLifecycleStatus): boolean {
  return status === "connecting" || status === "connect_failed";
}

export type L2GraceOpts = {
  blipStartedAtMs?: number;
  lastLiveAtMs?: number;
  nowMs?: number;
};

/** Deadline to keep waiting for L2 before L1′. @see docs/security/p2pchatprotocol.md §16 */
export function l2GraceDeadlineMs(
  status: RoomLifecycleStatus,
  opts: L2GraceOpts = {},
): number | undefined {
  if (!isTransientL2Blip(status)) return undefined;
  const nowMs = opts.nowMs ?? Date.now();
  let deadline: number | undefined;
  if (opts.blipStartedAtMs) {
    deadline = opts.blipStartedAtMs + L2_RECONNECT_GRACE_MS;
  }
  if (opts.lastLiveAtMs) {
    const fromLast = opts.lastLiveAtMs + L2_RECONNECT_GRACE_MS;
    deadline = deadline == null ? fromLast : Math.max(deadline, fromLast);
    if (nowMs - opts.lastLiveAtMs < L2_RECENT_LIVE_HOLD_MS) {
      deadline = Math.max(deadline, nowMs + L2_RECONNECT_GRACE_MS);
    }
  }
  return deadline;
}

/** True while an L2 blip is still worth waiting out. */
export function shouldDeferRelayForL2Grace(
  status: RoomLifecycleStatus,
  blipStartedAtMs?: number,
  nowMs = Date.now(),
  lastLiveAtMs?: number,
): boolean {
  const deadline = l2GraceDeadlineMs(status, {
    blipStartedAtMs,
    lastLiveAtMs,
    nowMs,
  });
  return deadline != null && nowMs < deadline;
}

export function preferredChannel(
  status: RoomLifecycleStatus,
): "live" | "relay" {
  return status === "connected" ? "live" : "relay";
}

/** UI hint — may show live during brief L2 reconnect grace. */
export function composerPreferredChannelWithGrace(
  status: RoomLifecycleStatus,
  blipStartedAtMs?: number,
  nowMs = Date.now(),
  lastLiveAtMs?: number,
): "live" | "relay" {
  if (status === "connected") return "live";
  if (
    shouldDeferRelayForL2Grace(status, blipStartedAtMs, nowMs, lastLiveAtMs)
  ) {
    return "live";
  }
  return "relay";
}

/** Live when connected; L1 relay when post-accept (no session keys required). */
export function canSendMessages(status: RoomLifecycleStatus): boolean {
  return status === "connected" || isRelayEligibleStatus(status);
}

/** Once accepted, a room must never again look pre-accept. */
const POST_ACCEPT_STATUSES = new Set<RoomLifecycleStatus>([
  "accepted",
  "connecting",
  "connected",
  "connect_failed",
  "closed",
]);

export function isPostAcceptStatus(status: RoomLifecycleStatus): boolean {
  return POST_ACCEPT_STATUSES.has(status);
}

/**
 * Monotonic guard for bootstrap/catalog/session hydration: a stale `pending`
 * payload must never regress a room that has already moved past acceptance.
 * @see docs/security/p2pchatprotocol.md §9 / §16
 */
export function resolveIncomingLifecycle(
  current: RoomLifecycleStatus,
  incoming: RoomLifecycleStatus,
): RoomLifecycleStatus {
  if (incoming === "pending" && isPostAcceptStatus(current)) return current;
  return incoming;
}

/** Pending invite visible during rescan; Accept blocked until tip (leave/revoke may lag). */
export function shouldAwaitChainSyncForInvite(
  nearTip: boolean,
  inviteExpiry: number,
  nowSec = nowUnix(),
): boolean {
  return !nearTip && !isInviteExpired(inviteExpiry, nowSec);
}

const ALLOWED: Record<RoomLifecycleStatus, ReadonlySet<RoomLifecycleStatus>> = {
  pending: new Set(["accepted", "declined", "expired", "failed", "destroyed"]),
  accepted: new Set(["connecting", "expired", "destroyed", "failed"]),
  connecting: new Set([
    "connected",
    "connect_failed",
    "expired",
    "destroyed",
    "closed",
  ]),
  connected: new Set(["connecting", "expired", "destroyed", "closed"]),
  connect_failed: new Set(["connecting", "expired", "destroyed", "closed"]),
  declined: new Set(["destroyed"]),
  expired: new Set(["destroyed"]),
  failed: new Set(["destroyed"]),
  closed: new Set(["destroyed"]),
  destroyed: new Set(),
};

export function canTransition(
  from: RoomLifecycleStatus,
  to: RoomLifecycleStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.has(to) ?? false;
}

export function transitionRoom(
  from: RoomLifecycleStatus,
  to: RoomLifecycleStatus,
): RoomLifecycleStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid room transition: ${from} → ${to}`);
  }
  return to;
}

/** After register handoff: accepted then immediately connecting. */
export function handoffToConnecting(
  from: RoomLifecycleStatus,
): RoomLifecycleStatus {
  const accepted = transitionRoom(from, "accepted");
  return transitionRoom(accepted, "connecting");
}
