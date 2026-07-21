import { describe, expect, it } from "vitest";
import {
  getNodeUrlFormatHints,
  normalizeNodeUrl,
  validateNodeUrlFormat,
} from "@/lib/validation/node-url";

describe("node-url", () => {
  it("normalizes a trailing slash", () => {
    expect(normalizeNodeUrl("https://example.com/daemon")).toBe(
      "https://example.com/daemon/",
    );
    expect(normalizeNodeUrl("https://example.com/daemon/")).toBe(
      "https://example.com/daemon/",
    );
  });

  it("validates https + non-empty", () => {
    expect(validateNodeUrlFormat("").ok).toBe(false);
    expect(validateNodeUrlFormat("http://insecure/").ok).toBe(false);
    expect(validateNodeUrlFormat("https://ok/daemon/").ok).toBe(true);
  });

  it("hints while editing", () => {
    expect(getNodeUrlFormatHints("http://x")).toContain(
      "URL must start with https://",
    );
    expect(getNodeUrlFormatHints("https://x")).toContain(
      "Add a trailing slash (/) at the end, e.g. …/daemon/",
    );
  });
});
