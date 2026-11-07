import { describe, expect, it } from "vitest";
import {
  clampCreationHeight,
  parseCreationHeightInput,
} from "@/lib/wallet/creation-height";

describe("clampCreationHeight", () => {
  it("clamps into [0, tip)", () => {
    expect(clampCreationHeight(0, 2_000_000)).toBe(0);
    expect(clampCreationHeight(1_999_999, 2_000_000)).toBe(1_999_999);
    expect(clampCreationHeight(2_000_000, 2_000_000)).toBe(1_999_999);
    expect(clampCreationHeight(9_999_999, 2_000_000)).toBe(1_999_999);
  });

  it("rejects negatives and non-finite as 0", () => {
    expect(clampCreationHeight(-1, 100)).toBe(0);
    expect(clampCreationHeight(Number.NaN, 100)).toBe(0);
    expect(clampCreationHeight(Number.POSITIVE_INFINITY, 100)).toBe(0);
  });

  it("floors fractional heights", () => {
    expect(clampCreationHeight(12.9, 100)).toBe(12);
  });

  it("returns 0 when tip is 0 or invalid", () => {
    expect(clampCreationHeight(50, 0)).toBe(0);
    expect(clampCreationHeight(50, -10)).toBe(0);
    expect(clampCreationHeight(50, Number.NaN)).toBe(0);
  });
});

describe("parseCreationHeightInput", () => {
  it("parses integers and rejects empty", () => {
    expect(parseCreationHeightInput("1971774")).toBe(1971774);
    expect(parseCreationHeightInput(" 0 ")).toBe(0);
    expect(parseCreationHeightInput("")).toBeNaN();
    expect(parseCreationHeightInput("abc")).toBeNaN();
  });
});
