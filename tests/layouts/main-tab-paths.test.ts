import { describe, expect, it } from "vitest";
import { activeTabFromPath, isTabDetailPath } from "@/layouts/mainTabPaths";

describe("mainTabPaths", () => {
  it("activeTabFromPath maps tab roots and branches", () => {
    expect(activeTabFromPath("/chats")).toBe("chats");
    expect(activeTabFromPath("/chats/room-1")).toBe("chats");
    expect(activeTabFromPath("/contacts")).toBe("contacts");
    expect(activeTabFromPath("/wallet")).toBe("wallet");
    expect(activeTabFromPath("/settings/security")).toBe("settings");
  });

  it("isTabDetailPath detects stack routes only", () => {
    expect(isTabDetailPath("/contacts")).toBe(false);
    expect(isTabDetailPath("/contacts/abc")).toBe(true);
    expect(isTabDetailPath("/chats")).toBe(false);
    expect(isTabDetailPath("/chats/room-1")).toBe(true);
    expect(isTabDetailPath("/settings")).toBe(false);
    expect(isTabDetailPath("/settings/about")).toBe(true);
    expect(isTabDetailPath("/wallet")).toBe(false);
  });
});
