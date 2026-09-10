import { messages } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deriveRelationshipId,
  deriveTopicRef,
} from "../../src/services/protocol/ids";
import { tombstoneInvite } from "../../src/services/protocol/inviteTombstone";
import {
  canSendLiveMessages,
  canTransition,
  handoffToConnecting,
  isInviteExpired,
  isRoomExpired,
  transitionRoom,
} from "../../src/services/protocol/roomLifecycle";
import {
  clearReplayCache,
  encodeCreateSmartBody,
  parseChatSmartBody,
  rememberReplayId,
  SmartMessageProtocolAdapter,
} from "../../src/services/protocol/SmartMessageProtocolAdapter";
import type { SmartMessageInvite } from "../../src/types/models";
import type { ChatInviteHandshake } from "../../src/types/protocol";

function sampleHandshake(
  overrides: Partial<ChatInviteHandshake> = {},
): ChatInviteHandshake {
  const now = Math.floor(Date.now() / 1000);
  return {
    protocolVersion: 1,
    inviteId: "aabbccdd",
    relationshipId: "bb".repeat(32),
    roomId: "11223344",
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "11".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
    ...overrides,
  };
}

describe("roomLifecycle", () => {
  it("allows pending → accepted → connecting → connected", () => {
    expect(canTransition("pending", "accepted")).toBe(true);
    expect(handoffToConnecting("pending")).toBe("connecting");
    expect(canTransition("connecting", "connected")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("declined", "connected")).toBe(false);
    expect(() => transitionRoom("pending", "connected")).toThrow();
  });

  it("gates live send on connected only", () => {
    expect(canSendLiveMessages("pending")).toBe(false);
    expect(canSendLiveMessages("accepted")).toBe(false);
    expect(canSendLiveMessages("connecting")).toBe(false);
    expect(canSendLiveMessages("connected")).toBe(true);
  });

  it("enforces dual TTL helpers", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isInviteExpired(now - 1000, now)).toBe(true);
    expect(isInviteExpired(now + 1000, now)).toBe(false);
    expect(isRoomExpired(now - 1000, now)).toBe(true);
  });
});

describe("smart message protocol create/register/revoke", () => {
  beforeEach(() => {
    clearReplayCache();
  });

  it("encodes slim packed create under 122 chars and round-trips", async () => {
    const { hydrateCreateHandshake } = await import(
      "../../src/services/protocol/SmartMessageProtocolAdapter"
    );
    const hs = sampleHandshake();
    const body = encodeCreateSmartBody(hs, "alice", ["chat.v1"]);
    expect(body.startsWith("{contact,")).toBe(true);
    expect(body.includes(",c,") || body.includes(",create,")).toBe(true);
    const byteLen = new TextEncoder().encode(body).length;
    expect(byteLen).toBeLessThanOrEqual(122);
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("create");
    if (parsed?.action === "create") {
      const hydrated = await hydrateCreateHandshake(
        parsed.payload.handshake,
        hs.relationshipId,
      );
      expect(hydrated.inviteId).toBe(hs.inviteId);
      expect(hydrated.roomId).toBe(hs.roomId);
      expect(hydrated.senderEphemeralPublicKey).toBe(
        hs.senderEphemeralPublicKey,
      );
      expect(hydrated.inviteExpiry).toBe(hs.inviteExpiry);
      expect(hydrated.roomTtl).toBe(hs.roomTtl);
      expect(hydrated.replayId).toBe(hs.replayId);
      expect(hydrated.relationshipId).toBe(hs.relationshipId);
      expect(hydrated.salt).toHaveLength(32);
    }
  });

  it("parses create and rejects legacy invite action", () => {
    const body = encodeCreateSmartBody(sampleHandshake(), "alice", ["chat.v1"]);
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("create");

    const legacy = messages.encodeSmartMessage(
      "contact",
      "invite",
      "room",
      "nonce",
      "blob",
    );
    expect(parseChatSmartBody(legacy)).toBeNull();
  });

  it("rejects duplicate replayId", async () => {
    const hs = sampleHandshake({ replayId: "ee".repeat(16) });
    rememberReplayId(hs.replayId);
    await expect(
      SmartMessageProtocolAdapter.composeCreate({
        contactId: "c1",
        handshake: hs,
        senderAlias: "a",
        relationshipEligible: true,
      }),
    ).rejects.toThrow(/replayId/);
  });

  it("fails closed when contact is not eligible", async () => {
    await expect(
      SmartMessageProtocolAdapter.composeCreate({
        contactId: "c1",
        handshake: sampleHandshake(),
        senderAlias: "a",
        relationshipEligible: false,
      }),
    ).rejects.toThrow(/eligible/);
  });
});

describe("tombstone", () => {
  it("wipes bootstrap and keeps replay metadata", () => {
    const invite: SmartMessageInvite = {
      id: "i1",
      contactId: "c1",
      roomId: "r1",
      inviteId: "inv1",
      replayId: "rep1",
      nonce: "n",
      expiry: new Date().toISOString(),
      inviteExpiry: 1,
      roomTtl: 2,
      senderAlias: "a",
      capabilities: ["chat.v1"],
      bootstrapEncrypted: "SECRET",
      status: "received",
      createdAt: new Date().toISOString(),
    };
    const { tombstone, invite: wiped } = tombstoneInvite(invite, "rejected");
    expect(wiped.bootstrapEncrypted).toBeUndefined();
    expect(tombstone.replayId).toBe("rep1");
    expect(tombstone.status).toBe("rejected");
  });
});

describe("ids", () => {
  it("derives order-independent relationshipId", async () => {
    const a = await deriveRelationshipId("aaaa", "bbbb");
    const b = await deriveRelationshipId("bbbb", "aaaa");
    expect(a).toBe(b);
  });

  it("derives topicRef from room + relationship", async () => {
    const topic = await deriveTopicRef("room1", "rel1");
    expect(topic).toHaveLength(64);
  });
});
