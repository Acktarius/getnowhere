import { describe, expect, it } from "vitest";
import { buildSaveTextFileResolveScript } from "../../native-wrapper/src/buildSaveTextFileResolveScript";

describe("buildSaveTextFileResolveScript", () => {
  it("dispatches save result into the WebView", () => {
    const script = buildSaveTextFileResolveScript({
      requestId: "req-1",
      ok: true,
    });
    expect(script).toContain("_resolveSaveTextFile");
    expect(script).toContain('"requestId":"req-1"');
  });
});
