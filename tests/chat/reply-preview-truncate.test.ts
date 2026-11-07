import { describe, expect, it } from "vitest";
import { truncateReplyPreview } from "@/utils/replyPreviewTruncate";

describe("truncateReplyPreview", () => {
  it("returns empty string unchanged", () => {
    expect(truncateReplyPreview("")).toBe("");
  });

  it("returns short strings unchanged", () => {
    expect(truncateReplyPreview("hello")).toBe("hello");
  });

  it("truncates long strings to 100 code points plus ellipsis", () => {
    const fixture = "a".repeat(120);
    const expected = `${"a".repeat(100)}…`;
    expect(truncateReplyPreview(fixture)).toBe(expected);
  });

  it("counts Unicode code points, not UTF-16 code units", () => {
    // Each emoji is one code point (may be a surrogate pair in UTF-16).
    const fixture = "😀".repeat(105);
    const expected = `${"😀".repeat(100)}…`;
    expect(truncateReplyPreview(fixture)).toBe(expected);
  });

  it("allows an explicit max code-point limit", () => {
    expect(truncateReplyPreview("abcdef", 3)).toBe("abc…");
  });
});
