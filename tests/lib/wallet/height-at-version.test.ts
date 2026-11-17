import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  heightAtVersion,
  parseHeightAtVersion,
} from "@/lib/wallet/height-at-version";

const versionPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../version",
);

describe("parseHeightAtVersion", () => {
  it("reads a positive integer and skips comments", () => {
    expect(
      parseHeightAtVersion("# note\nversion=0.5.6\nheightAtVersion=2199000\n"),
    ).toBe(2_199_000);
  });

  it("returns 0 when the field is missing or not a positive integer", () => {
    expect(parseHeightAtVersion("version=0.5.6\n")).toBe(0);
    expect(parseHeightAtVersion("heightAtVersion=0\n")).toBe(0);
    expect(parseHeightAtVersion("heightAtVersion=nope\n")).toBe(0);
  });
});

describe("heightAtVersion", () => {
  it("matches heightAtVersion in the repo version file", () => {
    const text = readFileSync(versionPath, "utf8");
    expect(heightAtVersion()).toBe(2_199_000);
    expect(heightAtVersion()).toBe(parseHeightAtVersion(text));
  });
});
