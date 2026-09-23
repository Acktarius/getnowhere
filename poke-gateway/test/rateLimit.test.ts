import { afterEach, describe, expect, it } from "vitest";
import {
  _resetPokeRateLimitsForTests,
  consumeGlobalPokeSlot,
  consumePokeSlot,
} from "../src/rateLimit.js";

describe("poke rate limits", () => {
  afterEach(() => {
    _resetPokeRateLimitsForTests();
  });

  it("allows a burst of 10, then rejects the next without storing it", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) {
      const handle = `h${String(i).padStart(13, "0")}`;
      expect(consumeGlobalPokeSlot(now)).toBe(true);
      expect(consumePokeSlot(handle, now)).toBe(true);
    }
    const spilled = "h0000000000010";
    expect(consumeGlobalPokeSlot(now)).toBe(false);
    expect(consumePokeSlot(spilled, now)).toBe(true);
  });

  it("refills one global slot per second", () => {
    const now = 2_000_000;
    for (let i = 0; i < 10; i++) consumeGlobalPokeSlot(now);
    expect(consumeGlobalPokeSlot(now)).toBe(false);
    expect(consumeGlobalPokeSlot(now + 1000)).toBe(true);
    expect(consumeGlobalPokeSlot(now + 1000)).toBe(false);
  });

  it("still limits one poke per handle per 5 minutes", () => {
    const now = 3_000_000;
    expect(consumePokeSlot("abcdefghijklmn", now)).toBe(true);
    expect(consumePokeSlot("abcdefghijklmn", now + 1)).toBe(false);
    expect(consumePokeSlot("abcdefghijklmn", now + 5 * 60 * 1000)).toBe(true);
  });
});
