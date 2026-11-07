import { describe, expect, it } from "vitest";
import { shortRoomId, shortTopicRef } from "@/utils/format";

describe("shortRoomId", () => {
  it("truncates 8-hex (4-byte) room id to head4+ellipsis+tail2", () => {
    expect(shortRoomId("aabbccdd")).toBe("aabb…dd");
  });

  it("includes characters from both ends", () => {
    const result = shortRoomId("aabbccdd");
    expect(result.startsWith("aabb")).toBe(true);
    expect(result.endsWith("dd")).toBe(true);
    expect(result).toContain("…");
  });

  it("is deterministic — same input always same output", () => {
    const id = "deadbeef";
    expect(shortRoomId(id)).toBe(shortRoomId(id));
  });

  it("returns empty string for empty input", () => {
    expect(shortRoomId("")).toBe("");
  });

  it("passes through very short ids unchanged", () => {
    expect(shortRoomId("ab")).toBe("ab");
    expect(shortRoomId("abcdef")).toBe("abcdef");
  });

  it("truncates legacy 16-hex ids with head4+ellipsis+tail4", () => {
    const id = "aabbccdd11223344";
    const result = shortRoomId(id);
    expect(result.startsWith("aabb")).toBe(true);
    expect(result.endsWith("3344")).toBe(true);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(id.length);
  });
});

describe("shortTopicRef", () => {
  it("truncates a 64-hex topic ref to 8……8", () => {
    const full = "a".repeat(32) + "b".repeat(32);
    const result = shortTopicRef(full);
    expect(result.startsWith("a".repeat(8))).toBe(true);
    expect(result.endsWith("b".repeat(8))).toBe(true);
    expect(result.length).toBeLessThan(full.length);
  });

  it("never returns the full 64-hex value", () => {
    const full = "c".repeat(64);
    expect(shortTopicRef(full).length).toBeLessThan(full.length);
  });

  it("passes through short strings unchanged", () => {
    expect(shortTopicRef("abc")).toBe("abc");
  });
});
