/**
 * Pure room lifecycle transitions + TTL helpers.
 * Live messaging is allowed only when status === "connected".
 */

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
