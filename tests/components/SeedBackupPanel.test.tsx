import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeedBackupPanel } from "@/components/SeedBackupPanel";

const SEED_PHRASE = "abandon ability able about above absent";

describe("SeedBackupPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("reveals seed words that are non-selectable and have no Copy", () => {
    const { container } = render(
      <SeedBackupPanel seedPhrase={SEED_PHRASE} onConfirm={() => undefined} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reveal seed phrase/i }),
    );

    const words = SEED_PHRASE.split(" ");
    for (const [i, word] of words.entries()) {
      const el = screen.getByText(word);
      expect(el).toBeInTheDocument();
      expect(el.style.userSelect).toBe("none");
      expect(el.style.webkitUserSelect).toBe("none");
      const indexEl = screen.getByText(String(i + 1));
      expect(indexEl.style.userSelect).toBe("none");
      expect(indexEl.style.webkitUserSelect).toBe("none");
    }

    const seedGrid = container.querySelector(".wrap");
    expect(seedGrid).toBeTruthy();
    expect(seedGrid!.querySelectorAll("button")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: /^copy$/i }),
    ).not.toBeInTheDocument();
  });

  it("enables Confirm backup on the checkbox only, regardless of reveal", () => {
    const onConfirm = vi.fn();
    render(<SeedBackupPanel seedPhrase={SEED_PHRASE} onConfirm={onConfirm} />);

    const confirm = screen.getByRole("button", { name: /confirm backup/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps Confirm backup disabled when the seed is revealed but unchecked", () => {
    render(
      <SeedBackupPanel seedPhrase={SEED_PHRASE} onConfirm={() => undefined} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /reveal seed phrase/i }),
    );
    expect(
      screen.getByRole("button", { name: /confirm backup/i }),
    ).toBeDisabled();
  });
});
