import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownFencedCode } from "@/components/MarkdownFencedCode";

const writeText = vi.fn<(text: string) => Promise<void>>();

describe("MarkdownFencedCode", () => {
  afterEach(() => {
    cleanup();
    writeText.mockReset();
  });

  it("still copies via useCopy, not copySensitive", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeText.mockResolvedValue(undefined) },
    });
    const code = "plain-chat-fence-code";
    render(<MarkdownFencedCode code={code} />);
    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledWith(code);
  });
});
