import { describe, expect, it } from "vitest";
import {
  describePasswordFailure,
  walletPasswordIsAcceptable,
} from "@/utils/walletPassword";

describe("wallet password policy", () => {
  it("requires at least 13 characters and every character class", () => {
    expect(walletPasswordIsAcceptable("StrongPass1!x")).toBe(true);
    expect(walletPasswordIsAcceptable("Short1!Aa")).toBe(false);
    expect(walletPasswordIsAcceptable("alllowercase1!")).toBe(false);
    expect(walletPasswordIsAcceptable("ALLUPPERCASE1!")).toBe(false);
    expect(walletPasswordIsAcceptable("NoDigitsHere!!")).toBe(false);
    expect(walletPasswordIsAcceptable("NoSymbolsHere1")).toBe(false);
    expect(walletPasswordIsAcceptable(`Aa1!${"x".repeat(1021)}`)).toBe(false);
  });

  it("returns actionable validation messages", () => {
    expect(describePasswordFailure("")).toBe("Password is required.");
    expect(describePasswordFailure("Short1!Aa")).toMatch(/at least 13/);
    expect(describePasswordFailure("alllowercase1!")).toMatch(
      /uppercase, lowercase, digit, and symbol/,
    );
    expect(describePasswordFailure(`Aa1!${"x".repeat(1021)}`)).toMatch(
      /at most 1024 UTF-8 bytes/,
    );
  });
});
