import { describe, expect, it, vi } from "vitest";
import { handlePokeWebViewMessage } from "../../native-wrapper/src/handlePokeWebViewMessage";

describe("handlePokeWebViewMessage", () => {
  it("ignores unrelated messages", () => {
    const refresh = vi.fn();
    expect(handlePokeWebViewMessage('{"channel":"other"}', refresh)).toBe(
      false,
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("calls refreshToken on refreshToken action", () => {
    const refresh = vi.fn();
    const raw = JSON.stringify({
      channel: "gnh-poke",
      direction: "command",
      action: "refreshToken",
    });
    expect(handlePokeWebViewMessage(raw, refresh)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
