import { describe, expect, it } from "vitest";
import {
  deriveRelationshipId,
  deriveTopicRef,
  sortPaymentIds,
} from "../../src/services/protocol/ids";

const A = "a1".repeat(32);
const B = "b2".repeat(32);

describe("relationship id derivation", () => {
  it("is order independent so each peer derives the same id from its own contact record", async () => {
    expect(await deriveRelationshipId(A, B)).toBe(
      await deriveRelationshipId(B, A),
    );
  });

  it("ignores payment id case, so a peer that stored uppercase still meets on the same topic", async () => {
    const lower = await deriveRelationshipId(A, B);
    const mixed = await deriveRelationshipId(A.toUpperCase(), B);
    const upper = await deriveRelationshipId(A.toUpperCase(), B.toUpperCase());
    expect(mixed).toBe(lower);
    expect(upper).toBe(lower);
  });

  it("ignores surrounding whitespace from pasted payment ids", async () => {
    expect(await deriveRelationshipId(` ${A} `, `\t${B}\n`)).toBe(
      await deriveRelationshipId(A, B),
    );
  });

  it("still separates distinct pairs", async () => {
    const other = "c3".repeat(32);
    expect(await deriveRelationshipId(A, B)).not.toBe(
      await deriveRelationshipId(A, other),
    );
  });

  it("sortPaymentIds returns canonical lowercase ordering", () => {
    expect(sortPaymentIds(B.toUpperCase(), A)).toEqual([A, B]);
    expect(sortPaymentIds(A, B.toUpperCase())).toEqual([A, B]);
  });
});

describe("topic derivation", () => {
  it("is stable across case differences in roomId and relationshipId", async () => {
    const relationshipId = await deriveRelationshipId(A, B);
    const roomId = "1122334455667788";
    expect(
      await deriveTopicRef(roomId.toUpperCase(), relationshipId.toUpperCase()),
    ).toBe(await deriveTopicRef(roomId, relationshipId));
  });

  it("gives each room its own topic within one relationship", async () => {
    const relationshipId = await deriveRelationshipId(A, B);
    expect(await deriveTopicRef("1122334455667788", relationshipId)).not.toBe(
      await deriveTopicRef("8877665544332211", relationshipId),
    );
  });

  it("returns 64 lowercase hex chars for swarm.join", async () => {
    const topicRef = await deriveTopicRef(
      "1122334455667788",
      await deriveRelationshipId(A, B),
    );
    expect(topicRef).toMatch(/^[0-9a-f]{64}$/);
  });
});
