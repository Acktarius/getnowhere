import { describe, expect, it } from "vitest";
import { shortAddress, shortTopicRef } from "@/utils/format";

describe("shortAddress (import privacy)", () => {
  it("masks to first 5 and last 5 for long addresses", () => {
    const addr = `ccx7${"a".repeat(90)}z`;
    expect(shortAddress(addr, 5, 5)).toBe(
      `${addr.slice(0, 5)}…${addr.slice(-5)}`,
    );
  });

  it("returns short values unchanged", () => {
    expect(shortAddress("ccx7ab", 5, 5)).toBe("ccx7ab");
  });
});

describe("shortTopicRef", () => {
  it("masks 64-char hex refs as 8......8", () => {
    const ref = "a".repeat(64);
    expect(shortTopicRef(ref)).toBe(`${"a".repeat(8)}......${"a".repeat(8)}`);
  });
});
