/**
 * TTL smart-message spend policy (RED). Task 2.2 extracts `smartMessageSpendPolicy`.
 * @see openspec/changes/archive/2026-09-03-l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import {
  DUST_THRESHOLD,
  MESSAGE_TX_AMOUNT_ATOMIC,
  type OwnedOutput,
  PRETTY_AMOUNTS,
} from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WALLET_DONATION_ADDRESS } from "@/lib/config";
import { readSentRecords } from "@/services/conceal/sync/messages-store";
import { readPendingRecords } from "@/services/conceal/sync/pending-store";
import * as spend from "@/services/conceal/sync/spend";
import {
  FEE_ATOMIC,
  MIXIN,
  selectSpendInputs,
} from "@/services/conceal/sync/spend";

const sendFixture = vi.hoisted(() => {
  const calls: string[] = [];
  const state = {
    unspent: [] as OwnedOutput[],
    built: null as null | {
      hash: string;
      serialized: string;
      txSecretKey: string;
      fee: number;
      sentAmount: number;
      inputs: { amount: number; keyImage: string; ringPublicKeys: string[] }[];
    },
  };
  const runtime = {
    raw: {} as Record<string, unknown>,
    viewOnly: false,
    account: {
      address: "ccx-own",
      keys: { spend: { pub: "aa" }, view: { pub: "bb" } },
    },
    state: { scannedHeight: 50_000, spentKeyImages: [] as string[] },
    daemon: {
      getHeight: async () => runtime.state.scannedHeight,
      getNodeFeeAddress: async () => "",
      getRandomOuts: async (amounts: number[], ringSize: number) =>
        amounts.map((amount) => ({
          amount,
          outs: Array.from({ length: ringSize }, (_, i) => ({ index: i })),
        })),
      sendRawTransaction: async () => {
        calls.push("broadcast");
      },
    },
  };
  return { calls, state, runtime };
});

const persistRuntime = vi.fn(async () => {
  sendFixture.calls.push("persist");
});
const syncRuntime = vi.fn(async () => {
  sendFixture.calls.push("sync");
  return 0;
});

vi.mock("@/services/conceal/sync/runtime", () => ({
  requireRuntime: () => sendFixture.runtime,
  persistRuntime: (...args: unknown[]) => persistRuntime(...(args as [])),
  syncRuntime: (...args: unknown[]) => syncRuntime(...(args as [])),
  decoysFromDaemon: (raw: unknown) => raw,
}));

vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    getUnspentOutputs: () => sendFixture.state.unspent,
    transactions: {
      ...actual.transactions,
      buildMessageTransaction: (opts: {
        unspentOutputs: OwnedOutput[];
        fee: number;
        mixin: number;
        messageAmount: number;
      }) => {
        sendFixture.state.built = {
          hash: "cd".repeat(32),
          serialized: "00",
          txSecretKey: "ef".repeat(32),
          fee: opts.fee,
          sentAmount: opts.messageAmount,
          inputs: opts.unspentOutputs.map((out) => ({
            amount: out.amount,
            keyImage: out.keyImage,
            ringPublicKeys: Array.from({ length: opts.mixin + 1 }, () => "11"),
          })),
        };
        return sendFixture.state.built;
      },
    },
  };
});

/** Policy shape Task 2.2 will export from the existing `hasTtl` branches. */
type SmartMessageSpendPolicy = {
  feeForSelect: number;
  attachNodeFee: boolean;
  mixin: number;
};

const MINED_TTL_UNIX = 0;
const RELAY_TTL_UNIX = MINED_TTL_UNIX + 6 * 60;

function fakeOut(amount: number, keyImage: string): OwnedOutput {
  return {
    amount,
    globalIndex: 1,
    outputIndex: 0,
    txPublicKey: "aa".repeat(32),
    publicKey: "bb".repeat(32),
    keyImage,
  };
}

function smartMessageSpendPolicy(
  ttlUnixSeconds: number,
): SmartMessageSpendPolicy {
  const fn = (spend as { smartMessageSpendPolicy?: unknown })
    .smartMessageSpendPolicy;
  if (typeof fn !== "function") {
    throw new Error("smartMessageSpendPolicy is not exported");
  }
  return (fn as (ttl: number) => SmartMessageSpendPolicy)(ttlUnixSeconds);
}

describe("smartMessageSpendPolicy", () => {
  it("skips network fee when TTL is set", () => {
    const ttl = smartMessageSpendPolicy(RELAY_TTL_UNIX);
    expect(ttl.feeForSelect).toBe(0);
  });

  it("skips remote-node fee when TTL is set", () => {
    const ttl = smartMessageSpendPolicy(RELAY_TTL_UNIX);
    expect(ttl.attachNodeFee).toBe(false);
  });

  it("keeps network and node fee on a mined (TTL 0) message", () => {
    const mined = smartMessageSpendPolicy(MINED_TTL_UNIX);
    expect(mined.feeForSelect).toBe(FEE_ATOMIC);
    expect(mined.attachNodeFee).toBe(true);
  });

  it("uses the same mixin for TTL and mined messages", () => {
    const ttl = smartMessageSpendPolicy(RELAY_TTL_UNIX);
    const mined = smartMessageSpendPolicy(MINED_TTL_UNIX);
    expect(ttl.mixin).toBe(MIXIN);
    expect(mined.mixin).toBe(MIXIN);
    expect(ttl.mixin).toBe(mined.mixin);
  });
});

describe("selectSpendInputs dust policy", () => {
  it("picks the pretty out and skips the dust out in the same pool", () => {
    const dustAmount = PRETTY_AMOUNTS.find(
      (amount) => amount > 0 && amount < DUST_THRESHOLD,
    );
    const prettyAmount = PRETTY_AMOUNTS.find(
      (amount) => amount > DUST_THRESHOLD && amount >= MESSAGE_TX_AMOUNT_ATOMIC,
    );
    if (dustAmount === undefined || prettyAmount === undefined) {
      throw new Error(
        "PRETTY_AMOUNTS must include a dust loser and a pretty winner",
      );
    }
    expect(dustAmount).not.toBe(prettyAmount);

    const dust = fakeOut(dustAmount, "dust-loser");
    const pretty = fakeOut(prettyAmount, "pretty-winner");
    const { selected } = selectSpendInputs(
      [dust, pretty],
      MESSAGE_TX_AMOUNT_ATOMIC,
    );

    expect(selected.map((out) => out.keyImage)).toEqual([pretty.keyImage]);
    expect(selected[0]?.amount).toBe(prettyAmount);
    expect(selected.every((out) => out.amount > DUST_THRESHOLD)).toBe(true);
  });

  it("rejects a dust-only pool even when that dust amount equals the target", () => {
    const dustAmount = PRETTY_AMOUNTS.find(
      (amount) => amount > 0 && amount < DUST_THRESHOLD,
    );
    if (dustAmount === undefined) {
      throw new Error("PRETTY_AMOUNTS must include a dust denomination");
    }
    const dust = fakeOut(dustAmount, "dust-only");
    expect(() => selectSpendInputs([dust], dustAmount)).toThrow();
  });
});

describe("sendSmartMessage persistence", () => {
  beforeEach(() => {
    const dustAmount = PRETTY_AMOUNTS.find(
      (amount) => amount > 0 && amount < DUST_THRESHOLD,
    );
    const spendAmount = PRETTY_AMOUNTS.find(
      (amount) =>
        amount > DUST_THRESHOLD &&
        amount >= MESSAGE_TX_AMOUNT_ATOMIC + FEE_ATOMIC,
    );
    if (dustAmount === undefined || spendAmount === undefined) {
      throw new Error("PRETTY_AMOUNTS must include dust and a spendable out");
    }
    sendFixture.calls.length = 0;
    sendFixture.state.built = null;
    sendFixture.state.unspent = [
      fakeOut(dustAmount, "ki-dust"),
      fakeOut(spendAmount, "ki-spend"),
    ];
    sendFixture.runtime.raw = {};
    persistRuntime.mockClear();
    syncRuntime.mockClear();
  });

  function send(extra: { deferPersist?: boolean } = {}) {
    return spend.sendSmartMessage({
      recipientAddress: WALLET_DONATION_ADDRESS,
      body: "accept",
      ...extra,
    });
  }

  it("deferPersist keeps sent, pending and tx key in raw without saving or syncing", async () => {
    const result = await send({ deferPersist: true });
    const built = sendFixture.state.built;
    if (!built) throw new Error("message transaction was not built");

    expect(result).toEqual({ hash: built.hash });
    expect(sendFixture.calls).toEqual(["broadcast"]);
    expect(persistRuntime).not.toHaveBeenCalled();
    expect(syncRuntime).not.toHaveBeenCalled();

    const raw = sendFixture.runtime.raw as Parameters<
      typeof readSentRecords
    >[0];
    expect(readSentRecords(raw).map((r) => r.id)).toEqual([built.hash]);
    const pending = readPendingRecords(raw);
    expect(pending.map((r) => r.hash)).toEqual([built.hash]);
    expect(pending[0]?.spentKeyImages).toEqual(
      built.inputs.map((vin) => vin.keyImage),
    );
    expect(raw.txPrivateKeys).toEqual({ [built.hash]: built.txSecretKey });
  });

  it("without deferPersist saves once and kicks a sync after broadcast", async () => {
    const result = await send();
    const built = sendFixture.state.built;
    if (!built) throw new Error("message transaction was not built");

    expect(result).toEqual({ hash: built.hash });
    expect(sendFixture.calls).toEqual(["broadcast", "persist", "sync"]);
    expect(persistRuntime).toHaveBeenCalledOnce();
    expect(persistRuntime).toHaveBeenCalledWith(sendFixture.runtime);
    expect(syncRuntime).toHaveBeenCalledOnce();
  });
});
