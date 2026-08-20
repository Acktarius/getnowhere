import { describe, expect, it } from "vitest";
import { buildChatAad, buildProofAad } from "@/services/protocol/proofAad";
import type { P2PSessionConfig } from "@/types/protocol";

function baseSession(overrides: Partial<P2PSessionConfig>): P2PSessionConfig {
  return {
    sessionId: "sess",
    roomId: "room1",
    relationshipId: "rel",
    cipherSuite: "CHACHA20_POLY1305_V1",
    topicSuite: "SHA256_V1",
    topicEpoch: 0,
    topicRef: "aa".repeat(32),
    sendKeyRef: "sk",
    recvKeyRef: "rk",
    nonceSeed: "ns",
    nonceStrategy: "counter_from_seed",
    sendCounter: 0,
    recvCounter: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildProofAad", () => {
  it("v1 AAD format", () => {
    const aad = buildProofAad("room1", baseSession({}));
    expect(new TextDecoder().decode(aad)).toBe("v1|room1|sess");
  });

  it("v2 AAD includes epoch and suite", () => {
    const aad = buildProofAad(
      "room1",
      baseSession({ topicSuite: "HKDF_EPOCH_V1", topicEpoch: 3 }),
    );
    expect(new TextDecoder().decode(aad)).toBe("v2|room1|sess|3|HKDF_EPOCH_V1");
  });

  it("v2 chat AAD stays v1 session binding", () => {
    const aad = buildChatAad(
      "room1",
      baseSession({ topicSuite: "HKDF_EPOCH_V1", topicEpoch: 2 }),
    );
    expect(new TextDecoder().decode(aad)).toBe("v1|room1|sess");
  });
});
