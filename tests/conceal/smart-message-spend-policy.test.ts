/**
 * TTL smart-message spend policy (RED). Task 2.2 extracts `smartMessageSpendPolicy`.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import {
  DUST_THRESHOLD,
  MESSAGE_TX_AMOUNT_ATOMIC,
  type OwnedOutput,
  PRETTY_AMOUNTS,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import * as spend from "@/services/conceal/sync/spend";
import {
  FEE_ATOMIC,
  MIXIN,
  selectSpendInputs,
} from "@/services/conceal/sync/spend";

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
