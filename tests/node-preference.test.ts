import { describe, expect, it } from "vitest";
import {
  getPreferredNode,
  loadNodePreference,
  setPreferredNode,
} from "@/lib/network/node-preference";

describe("node-preference", () => {
  it("persists and clears the preferred node", () => {
    setPreferredNode(null);
    loadNodePreference();
    expect(getPreferredNode()).toBeNull();

    setPreferredNode("https://example.com/daemon/");
    expect(getPreferredNode()).toBe("https://example.com/daemon/");

    setPreferredNode(null);
    expect(getPreferredNode()).toBeNull();
  });
});
