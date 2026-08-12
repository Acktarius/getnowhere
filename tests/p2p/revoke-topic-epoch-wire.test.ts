import { describe, expect, it } from "vitest";
import {
  encodeRevokeSmartBody,
  parseChatSmartBody,
} from "@/services/protocol/SmartMessageProtocolAdapter";

describe("revoke topicEpoch wire", () => {
  it("round-trips optional topicEpoch", () => {
    const body = encodeRevokeSmartBody({
      inviteId: "a1b2c3d4",
      replayId: "1122334455667788",
      reasonCode: "room_revoked",
      roomId: "01020304",
      topicEpoch: 2,
    });
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("revoke");
    if (parsed?.action !== "revoke") return;
    expect(parsed.payload.topicEpoch).toBe(2);
  });

  it("omits topicEpoch when absent", () => {
    const body = encodeRevokeSmartBody({
      inviteId: "a1b2c3d4",
      replayId: "1122334455667788",
      reasonCode: "room_revoked",
      roomId: "01020304",
    });
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("revoke");
    if (parsed?.action !== "revoke") return;
    expect(parsed.payload.topicEpoch).toBeUndefined();
  });
});
