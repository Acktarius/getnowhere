import { beforeEach, describe, expect, it } from "vitest";
import {
  __clearRelationshipTopicEpochsForTests,
  getRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import { applyRelationshipTopicEpoch } from "@/services/p2p/topicEpochContactSync";

describe("applyRelationshipTopicEpoch", () => {
  beforeEach(() => {
    __clearRelationshipTopicEpochsForTests();
  });

  it("sets local relationship epoch map", async () => {
    const rel = "ab".repeat(32);
    await applyRelationshipTopicEpoch(rel, 2);
    expect(getRelationshipTopicEpoch(rel)).toBe(2);
  });
});
