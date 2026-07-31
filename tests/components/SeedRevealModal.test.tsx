import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeedRevealModal } from "@/components/SeedRevealModal";

const SEED_PHRASE = "abandon ability able about above absent";
const SPEND = "spendkeyhex";
const VIEW = "viewkeyhex";

function renderModal(
  overrides: Partial<React.ComponentProps<typeof SeedRevealModal>> = {},
) {
  return render(
    <SeedRevealModal
      open
      seedPhrase={SEED_PHRASE}
      spendKey={SPEND}
      viewKey={VIEW}
      onClose={() => undefined}
      {...overrides}
    />,
  );
}

describe("SeedRevealModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows restore warning, seed words, and keys when open", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/here is your seed|safe place|wallet restoration/i),
    ).toBeInTheDocument();
    for (const word of SEED_PHRASE.split(" ")) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
    expect(screen.getByText(SPEND)).toBeInTheDocument();
    expect(screen.getByText(VIEW)).toBeInTheDocument();
  });

  it("calls onClose when Got it is clicked", () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when scrim is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });

    const scrim = container.querySelector(".scrim");
    expect(scrim).toBeTruthy();
    fireEvent.click(scrim!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Need more time disabled before 30s and enables at 30s", async () => {
    renderModal();

    const needMoreTime = screen.getByRole("button", {
      name: /need more time/i,
    });
    expect(needMoreTime).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(needMoreTime).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(needMoreTime).toBeEnabled();
  });

  it("restarts the fade cycle when Need more time is clicked", async () => {
    renderModal();

    const needMoreTime = screen.getByRole("button", {
      name: /need more time/i,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(needMoreTime).toBeEnabled();

    fireEvent.click(needMoreTime);
    expect(needMoreTime).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(needMoreTime).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(needMoreTime).toBeEnabled();
  });

  it("auto-closes after 5s grace once Need more time is enabled", async () => {
    const onClose = vi.fn();
    renderModal({ onClose });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
