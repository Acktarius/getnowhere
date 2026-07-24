import type { WalletState } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { reconcileIncomingPending } from "../../src/services/conceal/sync/incoming-pending-store";
import { pruneStaleMempoolReceived } from "../../src/services/conceal/sync/messages-store";
import { scanPoolForInbound } from "../../src/services/conceal/sync/pool";

describe("mempool inbound scan (0-conf)", () => {
  it("skips empty / unusable pool slots", () => {
    const result = scanPoolForInbound(
      [null, {}, { transaction: null, timestamp: 0, blockHash: "", fee: 0 }],
      () => null,
      () => [],
      {} as never,
      Date.now(),
      new Set(),
    );
    expect(result.incoming).toEqual([]);
    expect(result.receivedMessages).toEqual([]);
  });

  it("keeps 0-conf through mempool→mine grace; drops only after grace", () => {
    const now = Date.now();
    const fresh = {
      id: "abc",
      direction: "received" as const,
      counterpartyAddress: "recv:pid",
      counterpartyName: "PID",
      body: "{}",
      hasBody: true,
      sentTo: null,
      paymentIdFrom: "pid",
      paymentIdTo: null,
      timestamp: new Date(now).toISOString(),
      unread: true,
      blockHeight: 0,
      threadKey: "t",
    };
    const stale = {
      ...fresh,
      id: "old",
      timestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    };
    expect(
      pruneStaleMempoolReceived([fresh], new Set(["abc"]), new Set(), now).map(
        (r) => r.id,
      ),
    ).toEqual(["abc"]);
    // Left the pool but still within grace (mine lag) — keep.
    expect(
      pruneStaleMempoolReceived([fresh], new Set(), new Set(), now).map(
        (r) => r.id,
      ),
    ).toEqual(["abc"]);
    expect(
      pruneStaleMempoolReceived([fresh], new Set(), new Set(["abc"]), now).map(
        (r) => r.id,
      ),
    ).toEqual(["abc"]);
    // Past grace and not in pool/mined — drop.
    expect(
      pruneStaleMempoolReceived([stale], new Set(), new Set(), now).map(
        (r) => r.id,
      ),
    ).toEqual([]);
  });

  it("reconcileIncomingPending drops mined and prefers scanned", () => {
    const state = {
      transactions: [{ hash: "mined1" }],
    } as unknown as WalletState;
    const next = reconcileIncomingPending(
      [
        { hash: "mined1", amountAtomic: 100, createdAt: 1 },
        { hash: "old", amountAtomic: 50, createdAt: 1 },
      ],
      [{ hash: "fresh", amountAtomic: 200, createdAt: 99 }],
      state,
      99,
    );
    expect(next.map((r) => r.hash)).toEqual(["fresh", "old"]);
  });
});
