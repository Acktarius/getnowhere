import { describe, expect, it } from "vitest";
import {
  buildChatTopicTileSvg,
  getChatTopicTileMaskUrl,
} from "../../src/lib/chatTopicTiles";
import { ROOM_TOPIC_IDS } from "../../src/services/protocol/roomTopics";

describe("chatTopicTiles", () => {
  it("builds an SVG tile for every room topic", () => {
    for (const id of ROOM_TOPIC_IDS) {
      const svg = buildChatTopicTileSvg(id);
      expect(svg).toContain("<svg");
      expect(svg).toContain('stroke="#fff"');
      expect(svg).toContain("<path");
    }
  });

  it("returns a cached data-URI mask", () => {
    const a = getChatTopicTileMaskUrl("vacation");
    const b = getChatTopicTileMaskUrl("vacation");
    expect(a).toBe(b);
    expect(a.startsWith("data:image/svg+xml,")).toBe(true);
  });
});
