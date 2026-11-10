import { describe, expect, it } from "vitest";
import { registerScanDiag } from "@/screens/chats/ChatRoomScreen";

const probe = {
  hasInitiatorKey: true,
  registerCount: 2,
  matchingRegister: true,
};

describe("register scan diagnostics", () => {
  it("shows the probe when a handshake scan has run", () => {
    expect(registerScanDiag(probe, "pending")).toEqual({
      initiatorKey: "yes",
      registersScanned: "2",
      matchingRegister: "yes",
    });
  });

  it("keeps the placeholder while the first invite is still pending", () => {
    expect(registerScanDiag(null, "pending")).toEqual({
      initiatorKey: "…",
      registersScanned: "…",
      matchingRegister: "…",
    });
  });

  it("says the scan was skipped once the room is past the first handshake", () => {
    expect(registerScanDiag(null, "connected")).toEqual({
      initiatorKey: "saved session",
      registersScanned: "skipped",
      matchingRegister: "skipped",
    });
  });
});
