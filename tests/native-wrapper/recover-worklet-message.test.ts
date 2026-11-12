import { describe, expect, it } from "vitest";
import { parseRecoverWorkletCommand } from "../../native-wrapper/src/recoverWorkletMessage";

describe("parseRecoverWorkletCommand", () => {
  it("reads the bridge token for a recover command", () => {
    const raw = JSON.stringify({
      channel: "gnh-bridge",
      direction: "command",
      type: "recover-worklet",
      token: "abc",
    });
    expect(parseRecoverWorkletCommand(raw)).toEqual({ token: "abc" });
  });

  it("ignores a normal swarm join", () => {
    const raw = JSON.stringify({
      channel: "gnh-bridge",
      direction: "command",
      type: "join",
      token: "abc",
      topicRef: "aa",
    });
    expect(parseRecoverWorkletCommand(raw)).toBeNull();
  });
});
