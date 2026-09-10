import { describe, expect, it } from "vitest";
import { generatePokeId } from "@/lib/crypto/pokeId";

describe("generatePokeId", () => {
  it("returns exactly 14 characters", () => {
    expect(generatePokeId()).toHaveLength(14);
  });

  it("matches base64url charset /^[A-Za-z0-9_-]{14}$/", () => {
    expect(generatePokeId()).toMatch(/^[A-Za-z0-9_-]{14}$/);
  });

  it("returns different values on consecutive calls", () => {
    const a = generatePokeId();
    const b = generatePokeId();
    expect(a).not.toBe(b);
  });
});
