import { describe, expect, it } from "vitest";
import { roomBannerModel } from "@/services/protocol/roomBanner";
import type { RoomLifecycleStatus } from "@/types/models";

const alias = "Ada";

function banner(
  lifecycleStatus: RoomLifecycleStatus,
  extra: { lastConnectError?: string; openingRoom?: boolean } = {},
) {
  return roomBannerModel({ lifecycleStatus, alias, ...extra });
}

describe("roomBannerModel", () => {
  it("hides the row once connected", () => {
    expect(banner("connected").hidden).toBe(true);
    expect(banner("connected", { openingRoom: true }).hidden).toBe(true);
  });

  it("shows opening room before any lifecycle text", () => {
    expect(banner("pending", { openingRoom: true })).toEqual({
      hidden: false,
      text: "Opening room…",
      tone: "connecting",
    });
    expect(
      banner("connect_failed", {
        openingRoom: true,
        lastConnectError: "crypto_mismatch",
      }).text,
    ).toBe("Opening room…");
  });

  it("waits for the peer to accept while pending", () => {
    expect(banner("pending")).toEqual({
      hidden: false,
      text: "Waiting for Ada to accept",
      tone: "connecting",
    });
  });

  it.each(["accepted", "connecting"] as const)(
    "looks for the peer when %s",
    (status) => {
      expect(banner(status)).toEqual({
        hidden: false,
        text: "Looking for Ada…",
        tone: "connecting",
      });
    },
  );

  it("reports an unreachable secure link as offline", () => {
    expect(
      banner("connect_failed", { lastConnectError: "unreachable" }),
    ).toEqual({
      hidden: false,
      text: "Secure link unavailable",
      tone: "offline",
    });
  });

  it("reports a crypto mismatch as an error", () => {
    expect(
      banner("connect_failed", { lastConnectError: "crypto_mismatch" }),
    ).toEqual({
      hidden: false,
      text: "Crypto mismatch — leave room and create a new one",
      tone: "error",
    });
  });

  it.each(["timeout", "unknown", "aborted", undefined])(
    "keeps looking after a %s connect failure",
    (lastConnectError) => {
      expect(banner("connect_failed", { lastConnectError })).toEqual({
        hidden: false,
        text: "Looking for Ada…",
        tone: "connecting",
      });
    },
  );

  it.each([
    ["declined", "Invite declined"],
    ["expired", "Room expired"],
    ["failed", "Room failed"],
    ["closed", "Room closed"],
    ["destroyed", "Room destroyed"],
  ] as const)("shows %s as an error", (status, text) => {
    expect(banner(status)).toEqual({ hidden: false, text, tone: "error" });
  });
});
