/**
 * Expired L1′ TTL must leave wallet history, not linger as 0-conf pending.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { mapWalletTransactions } from "@/services/conceal/mapWalletTransactions";
import {
  dropExpiredTtl,
  type SdkMessageRecord,
} from "@/services/conceal/sync/messages-store";
import { readPendingRecords } from "@/services/conceal/sync/pending-store";

const NOW = Math.floor(Date.UTC(2026, 8, 3, 3, 0, 0) / 1000);

function sentTtl(
  id: string,
  ttlExpiresAt: number,
  extras: Partial<SdkMessageRecord> = {},
): SdkMessageRecord {
  return {
    id,
    direction: "sent",
    counterpartyAddress: "ccxPeer",
    counterpartyName: "Peer",
    body: "relay",
    hasBody: true,
    paymentIdFrom: null,
    paymentIdTo: "pid",
    timestamp: "2026-09-03T02:54:00.000Z",
    unread: false,
    blockHeight: 0,
    threadKey: "t",
    ttlExpiresAt,
    ...extras,
  };
}

function rawWith(partial: Record<string, unknown>): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    sentMessages: [],
    receivedMessages: [],
    pendingTransactions: [],
    incomingPending: [],
    ...partial,
  } as unknown as RawWalletV1;
}

describe("dropExpiredTtl wallet pending", () => {
  it("drops matching pending when the sent TTL elapses", () => {
    const raw = rawWith({
      sentMessages: [
        sentTtl("ttl-hash", NOW - 1),
        sentTtl("mined-keep", 0, { blockHeight: 99, ttlExpiresAt: undefined }),
      ],
      pendingTransactions: [
        {
          hash: "ttl-hash",
          amountAtomic: 11_100,
          timestampIso: "2026-09-03T02:54:00.000Z",
          type: "message",
          spentKeyImages: ["ki"],
          ttlExpiresAt: NOW - 1,
        },
        {
          hash: "mined-keep",
          amountAtomic: 11_100,
          timestampIso: "2026-09-03T02:54:00.000Z",
          type: "message",
          spentKeyImages: ["ki2"],
        },
      ],
    });

    const next = dropExpiredTtl(raw, NOW);
    expect(next.changed).toBe(true);
    expect(readPendingRecords(next.raw).map((p) => p.hash)).toEqual([
      "mined-keep",
    ]);
  });

  it("drops orphan message pending after the sent copy was already removed", () => {
    const raw = rawWith({
      pendingTransactions: [
        {
          hash: "already-dropped-sent",
          amountAtomic: 11_100,
          timestampIso: "2026-09-03T02:54:00.000Z",
          type: "message",
          spentKeyImages: ["ki"],
        },
      ],
    });

    const next = dropExpiredTtl(raw, NOW);
    expect(next.changed).toBe(true);
    expect(readPendingRecords(next.raw)).toEqual([]);
  });
});

describe("mapWalletTransactions TTL hide", () => {
  it("omits expired TTL pending and keeps a live TTL row", () => {
    const liveAt = Math.floor(Date.now() / 1000) + 360;
    const raw = rawWith({
      sentMessages: [sentTtl("expired-hash", 1), sentTtl("live-hash", liveAt)],
      pendingTransactions: [
        {
          hash: "expired-hash",
          amountAtomic: 11_100,
          timestampIso: "2026-09-03T02:54:00.000Z",
          type: "message",
          spentKeyImages: ["ki"],
          ttlExpiresAt: 1,
        },
        {
          hash: "live-hash",
          amountAtomic: 11_100,
          timestampIso: "2026-09-03T02:54:00.000Z",
          type: "message",
          spentKeyImages: ["ki2"],
          ttlExpiresAt: liveAt,
        },
      ],
    });

    const txs = mapWalletTransactions([], raw);
    expect(txs.map((t) => t.hash)).toEqual(["live-hash"]);
    expect(txs[0]?.zeroConf).toBe(true);
  });
});
