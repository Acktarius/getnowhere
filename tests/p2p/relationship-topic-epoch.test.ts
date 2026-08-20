import { beforeEach, describe, expect, it } from "vitest";
import {
  __clearRelationshipTopicEpochsForTests,
  bumpRelationshipTopicEpoch,
  getRelationshipTopicEpoch,
  syncRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";

describe("relationshipTopicEpochStore", () => {
  beforeEach(() => {
    __clearRelationshipTopicEpochsForTests();
  });

  it("starts at 0", () => {
    expect(getRelationshipTopicEpoch("aa".repeat(32))).toBe(0);
  });

  it("bumps monotonically", () => {
    const rel = "bb".repeat(32);
    expect(bumpRelationshipTopicEpoch(rel)).toBe(1);
    expect(bumpRelationshipTopicEpoch(rel)).toBe(2);
    expect(getRelationshipTopicEpoch(rel)).toBe(2);
  });

  it("sync applies peer max only", () => {
    const rel = "cc".repeat(32);
    bumpRelationshipTopicEpoch(rel);
    syncRelationshipTopicEpoch(rel, 1);
    expect(getRelationshipTopicEpoch(rel)).toBe(1);
    syncRelationshipTopicEpoch(rel, 3);
    expect(getRelationshipTopicEpoch(rel)).toBe(3);
    syncRelationshipTopicEpoch(rel, 2);
    expect(getRelationshipTopicEpoch(rel)).toBe(3);
  });
});
