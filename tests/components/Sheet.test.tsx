import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sheet } from "@/components/Sheet";

describe("Sheet", () => {
  afterEach(() => {
    cleanup();
  });

  it("stays a bottom sheet without anchorTop", () => {
    render(
      <Sheet open onClose={() => {}}>
        body
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toBe("sheet");
    expect(dialog.style.getPropertyValue("--sheet-top")).toBe("");
  });

  it("pins the top edge when anchorTop is set", () => {
    render(
      <Sheet open anchorTop={120} onClose={() => {}}>
        body
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("sheet--anchored");
    expect(dialog.style.getPropertyValue("--sheet-top")).toBe("120px");
  });
});
