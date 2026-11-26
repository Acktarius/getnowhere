import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  heightAtVersion,
  parseHeightAtVersion,
} from "@/lib/wallet/height-at-version";

const pinPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/lib/wallet/height-at-version.json",
);

describe("parseHeightAtVersion", () => {
  it("reads a positive safe integer from a pin object", () => {
    expect(parseHeightAtVersion({ heightAtVersion: 2_199_000 })).toBe(
      2_199_000,
    );
  });

  it("returns 0 when the field is missing or not a positive integer", () => {
    expect(parseHeightAtVersion({})).toBe(0);
    expect(parseHeightAtVersion({ heightAtVersion: 0 })).toBe(0);
    expect(parseHeightAtVersion({ heightAtVersion: "nope" })).toBe(0);
    expect(parseHeightAtVersion(null)).toBe(0);
  });
});

describe("heightAtVersion", () => {
  it("matches heightAtVersion in the JSON pin file", () => {
    const pin = JSON.parse(readFileSync(pinPath, "utf8")) as unknown;
    const parsed = parseHeightAtVersion(pin);
    expect(parsed).toBeGreaterThan(0);
    expect(heightAtVersion()).toBe(parsed);
  });
});
