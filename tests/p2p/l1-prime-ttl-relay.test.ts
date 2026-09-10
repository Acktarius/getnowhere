/**
 * L1′ relay TTL send path (RED). Named caller: HolepunchChatTransport.sendRelayText.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSmartMessageDelivery,
  bindSmartMessageContacts,
  ConcealSmartMessageAdapter,
} from "@/services/conceal/ConcealSmartMessageAdapter";
import { parseChatSmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type { ChatRelayPayload } from "@/types/protocol";

const { sendSmartMessage } = vi.hoisted(() => ({
  sendSmartMessage: vi.fn(),
}));

vi.mock("@/services/conceal/sync/spend", () => ({
  sendSmartMessage,
}));

const CONTACT_ID = "c-ttl-relay";
const PAYMENT_ID_TO = "fedcba9876543210";
const PAYMENT_ID_FROM = "0123456789abcdef";
const RECIPIENT_ADDRESS = "ccx7ttlRelayFixtureAddress0001";

const SIX_MIN_SEC = 6 * 60;
const SIXTY_MIN_SEC = 60 * 60;
const FROZEN_MS = Date.UTC(2026, 8, 2, 20, 0, 0);

/** Intended sendChatRelay input after task 1.2 (ttlUnixSeconds is missing today). */
type SendChatRelayInput = {
  contactId: string;
  relay: ChatRelayPayload;
  ttlUnixSeconds?: number;
};

function frozenNowSec(): number {
  return Math.floor(FROZEN_MS / 1000);
}

function ttlFromPreset(offsetSec: number): number {
  return frozenNowSec() + offsetSec;
}

function lastSendArg(): {
  ttlUnixSeconds?: number;
  body?: string;
} {
  const arg = sendSmartMessage.mock.calls.at(-1)?.[0] as
    | { ttlUnixSeconds?: number; body?: string }
    | undefined;
  return arg ?? {};
}

function recordedTtls(): Array<number | undefined> {
  return sendSmartMessage.mock.calls.map(
    (call) => (call[0] as { ttlUnixSeconds?: number }).ttlUnixSeconds,
  );
}

function sampleRelay(): ChatRelayPayload {
  return {
    type: "chat.relay",
    roomId: "aabbccdd",
    sentAt: frozenNowSec(),
    text: "hello via ttl",
  };
}

async function sendChatRelayWithTtl(
  input: SendChatRelayInput,
): Promise<{ txHash: string }> {
  return ConcealSmartMessageAdapter.sendChatRelay(input);
}

async function sendCreateInvite(): Promise<{ inviteId: string }> {
  const composed = await ConcealSmartMessageAdapter.composeInviteMessage({
    contactId: CONTACT_ID,
    senderAlias: "alice",
    relationshipId: "ab".repeat(32),
  });
  const payload =
    await ConcealSmartMessageAdapter.encryptInvitePayload(composed);
  return ConcealSmartMessageAdapter.sendInviteMessage(CONTACT_ID, payload, {
    recipientAddress: RECIPIENT_ADDRESS,
    paymentId: PAYMENT_ID_TO,
  });
}

beforeEach(() => {
  const mem = new Map<string, string>();
  setActiveStorageAdapter({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
    },
  });
  __resetSmartMessageDelivery();
  bindSmartMessageContacts({
    resolve: (contactId) =>
      contactId === CONTACT_ID
        ? {
            contactId: CONTACT_ID,
            address: RECIPIENT_ADDRESS,
            paymentIdFrom: PAYMENT_ID_FROM,
            paymentIdTo: PAYMENT_ID_TO,
            alias: "bob",
          }
        : undefined,
    list: () => [
      {
        contactId: CONTACT_ID,
        address: RECIPIENT_ADDRESS,
        paymentIdFrom: PAYMENT_ID_FROM,
        paymentIdTo: PAYMENT_ID_TO,
        alias: "bob",
      },
    ],
  });
  sendSmartMessage.mockReset();
  sendSmartMessage.mockResolvedValue({ hash: "tx-ttl-ok" });
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_MS);
});

afterEach(() => {
  vi.useRealTimers();
  __resetSmartMessageDelivery();
});

describe("sendChatRelay ttlUnixSeconds", () => {
  it("uses distinct 6 min, 60 min, and mined fixtures", () => {
    const ttlSix = ttlFromPreset(SIX_MIN_SEC);
    const ttlSixty = ttlFromPreset(SIXTY_MIN_SEC);
    expect(ttlSix).not.toBe(0);
    expect(ttlSixty).not.toBe(0);
    expect(ttlSix).not.toBe(ttlSixty);
    expect(ttlSixty - ttlSix).toBe(SIXTY_MIN_SEC - SIX_MIN_SEC);
  });

  it("omitted TTL (tap) stays mined 0", async () => {
    await sendChatRelayWithTtl({
      contactId: CONTACT_ID,
      relay: sampleRelay(),
    });
    expect(lastSendArg().ttlUnixSeconds).toBe(0);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "");
    expect(parsed?.action).toBe("relay");
  });

  it("explicit TTL 0 (tap) stays mined 0", async () => {
    await sendChatRelayWithTtl({
      contactId: CONTACT_ID,
      relay: sampleRelay(),
      ttlUnixSeconds: 0,
    });
    expect(lastSendArg().ttlUnixSeconds).toBe(0);
  });

  it("passes 6 min mempool TTL from the frozen clock", async () => {
    const ttlSix = ttlFromPreset(SIX_MIN_SEC);
    await sendChatRelayWithTtl({
      contactId: CONTACT_ID,
      relay: sampleRelay(),
      ttlUnixSeconds: ttlSix,
    });
    expect(lastSendArg().ttlUnixSeconds).toBe(ttlSix);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "");
    expect(parsed?.action).toBe("relay");
  });

  it("passes 60 min mempool TTL from the frozen clock", async () => {
    const ttlSixty = ttlFromPreset(SIXTY_MIN_SEC);
    await sendChatRelayWithTtl({
      contactId: CONTACT_ID,
      relay: sampleRelay(),
      ttlUnixSeconds: ttlSixty,
    });
    expect(lastSendArg().ttlUnixSeconds).toBe(ttlSixty);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "");
    expect(parsed?.action).toBe("relay");
  });

  it("does not retry a failed TTL broadcast as TTL 0", async () => {
    const ttlSix = ttlFromPreset(SIX_MIN_SEC);
    sendSmartMessage.mockRejectedValue(new Error("daemon rejected ttl tx"));
    await expect(
      sendChatRelayWithTtl({
        contactId: CONTACT_ID,
        relay: sampleRelay(),
        ttlUnixSeconds: ttlSix,
      }),
    ).rejects.toThrow(/daemon rejected ttl tx/);
    expect(sendSmartMessage).toHaveBeenCalledTimes(1);
    expect(recordedTtls()).toEqual([ttlSix]);
  });
});

describe("signaling stays mined TTL 0", () => {
  it("create invite broadcasts TTL 0", async () => {
    await sendCreateInvite();
    expect(lastSendArg().ttlUnixSeconds).toBe(0);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "", {
      allowSeenReplay: true,
      allowExpiredInvite: true,
    });
    expect(parsed?.action).toBe("create");
  });

  it("register broadcasts TTL 0", async () => {
    const sent = await sendCreateInvite();
    sendSmartMessage.mockClear();
    await ConcealSmartMessageAdapter.acceptInvite(sent.inviteId);
    expect(lastSendArg().ttlUnixSeconds).toBe(0);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "", {
      allowSeenReplay: true,
    });
    expect(parsed?.action).toBe("register");
  });

  it("revoke broadcasts TTL 0", async () => {
    await ConcealSmartMessageAdapter.revokeRoom({
      contactId: CONTACT_ID,
      inviteId: "aabbccdd",
      roomId: "11223344",
      replayId: "44".repeat(8),
    });
    expect(lastSendArg().ttlUnixSeconds).toBe(0);
    const parsed = parseChatSmartBody(lastSendArg().body ?? "", {
      allowSeenReplay: true,
    });
    expect(parsed?.action).toBe("revoke");
  });
});
