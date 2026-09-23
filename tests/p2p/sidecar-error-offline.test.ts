import { describe, expect, it } from "vitest";
import { sidecarErrorMarksOffline } from "@/services/p2p/HolepunchSidecarClient";

describe("sidecarErrorMarksOffline", () => {
  it("does not treat rate_limited as a dead bridge", () => {
    expect(sidecarErrorMarksOffline("rate_limited")).toBe(false);
  });

  it("does not treat remote_rate_limited as a dead bridge", () => {
    expect(sidecarErrorMarksOffline("remote_rate_limited")).toBe(false);
  });

  it("still treats sidecar_error as offline", () => {
    expect(sidecarErrorMarksOffline("sidecar_error")).toBe(true);
  });
});
