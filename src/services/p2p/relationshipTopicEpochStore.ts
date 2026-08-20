/**
 * Per-relationship Hyperswarm topic epoch for HKDF_EPOCH_V1 discovery rotation.
 * @see docs/security/capabilities-and-derivation.md
 */
import { normalizeHexId } from "@/services/protocol/ids";
import { getStorage } from "@/services/storage/StorageAdapter";

const KEY = "gnh.relationshipTopicEpoch";

function readAll(): Record<string, number> {
  try {
    const raw = getStorage().getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, number>): void {
  getStorage().setItem(KEY, JSON.stringify(all));
}

function relKey(relationshipId: string): string {
  return normalizeHexId(relationshipId);
}

export function getRelationshipTopicEpoch(relationshipId: string): number {
  const epoch = readAll()[relKey(relationshipId)];
  return typeof epoch === "number" && epoch >= 0 ? epoch : 0;
}

export function setRelationshipTopicEpoch(
  relationshipId: string,
  epoch: number,
): void {
  if (!Number.isInteger(epoch) || epoch < 0 || epoch > 0xffff_ffff) {
    throw new Error("topic epoch out of uint32 range.");
  }
  const all = readAll();
  all[relKey(relationshipId)] = epoch;
  writeAll(all);
}

/** Increment local epoch after v2 room teardown; returns the new epoch. */
export function bumpRelationshipTopicEpoch(relationshipId: string): number {
  const next = getRelationshipTopicEpoch(relationshipId) + 1;
  setRelationshipTopicEpoch(relationshipId, next);
  return next;
}

/** Apply peer epoch hint from L1 revoke (monotonic max). */
export function syncRelationshipTopicEpoch(
  relationshipId: string,
  peerEpoch: number,
): void {
  if (!Number.isInteger(peerEpoch) || peerEpoch < 0) return;
  const current = getRelationshipTopicEpoch(relationshipId);
  if (peerEpoch > current) {
    setRelationshipTopicEpoch(relationshipId, peerEpoch);
  }
}

/** Test helper. */
export function __clearRelationshipTopicEpochsForTests(): void {
  writeAll({});
}
