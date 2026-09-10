/**
 * Composer TTL flyout (RED). Chain fallback only; order 60 / 6 / 0.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHAIN_TTL_LONG_PRESS_MS,
  ChainSendFlyout,
  showChainTtlFlyout,
  ttlUnixFromDuration,
} from "@/screens/chats/chainSendFlyout";

/** Top → middle → bottom. Seconds = minutes * 60 (duration, not unix). */
const PRESET_MINUTES = [60, 6, 0] as const;

function secondsFromMinutes(minutes: number): number {
  return minutes * 60;
}

function flyoutTestId(minutes: number): string {
  return `ttl-flyout-${minutes}`;
}

function flyoutAriaLabel(minutes: number): string {
  return minutes === 0 ? "Send" : `Send ${minutes}-minute TTL`;
}

async function longPress(el: HTMLElement): Promise<void> {
  fireEvent.pointerDown(el);
  await act(async () => {
    vi.advanceTimersByTime(CHAIN_TTL_LONG_PRESS_MS);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ttlUnixFromDuration", () => {
  it("maps flyout duration to unix TTL for send", () => {
    const now = 1_700_000_000;
    expect(ttlUnixFromDuration(0, now)).toBeUndefined();
    expect(ttlUnixFromDuration(360, now)).toBe(now + 360);
    expect(ttlUnixFromDuration(3600, now)).toBe(now + 3600);
  });
});

describe("showChainTtlFlyout", () => {
  it("is true only when next send is chain fallback", () => {
    expect(showChainTtlFlyout(true)).toBe(true);
    expect(showChainTtlFlyout(false)).toBe(false);
  });
});

describe("ChainSendFlyout", () => {
  it("long-press on chain fallback reveals 60 then 6 then TTL 0", async () => {
    vi.useFakeTimers();
    render(<ChainSendFlyout viaChain onSend={vi.fn()} />);

    await longPress(screen.getByRole("button", { name: flyoutAriaLabel(0) }));

    const [topMin, midMin, bottomMin] = PRESET_MINUTES;
    expect(secondsFromMinutes(topMin)).not.toBe(secondsFromMinutes(midMin));
    expect(secondsFromMinutes(midMin)).not.toBe(secondsFromMinutes(bottomMin));

    const ordered = screen.getAllByTestId(/ttl-flyout-\d+/);
    expect(ordered.map((node) => node.getAttribute("data-testid"))).toEqual(
      PRESET_MINUTES.map(flyoutTestId),
    );
    for (const minutes of PRESET_MINUTES) {
      const btn = screen.getByTestId(flyoutTestId(minutes));
      expect(btn).toHaveAccessibleName(flyoutAriaLabel(minutes));
      if (minutes > 0) {
        expect(btn.querySelector(".lucide-hourglass")).toBeTruthy();
      }
    }
  });

  it("flyout presets send minutes * 60 seconds", async () => {
    vi.useFakeTimers();
    const onSend = vi.fn();
    render(<ChainSendFlyout viaChain onSend={onSend} />);
    await longPress(screen.getByRole("button", { name: flyoutAriaLabel(0) }));

    for (const minutes of PRESET_MINUTES) {
      onSend.mockClear();
      fireEvent.click(screen.getByTestId(flyoutTestId(minutes)));
      expect(onSend).toHaveBeenCalledWith(secondsFromMinutes(minutes));
    }
  });

  it("tap on chain fallback sends TTL 0 and does not open the flyout", () => {
    const onSend = vi.fn();
    render(<ChainSendFlyout viaChain onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: flyoutAriaLabel(0) }));

    expect(onSend).toHaveBeenCalledWith(secondsFromMinutes(0));
    expect(screen.queryByTestId(flyoutTestId(PRESET_MINUTES[0]))).toBeNull();
    expect(screen.queryByTestId(flyoutTestId(PRESET_MINUTES[1]))).toBeNull();
  });

  it("does not reveal a TTL flyout when next send is live Holepunch", async () => {
    vi.useFakeTimers();
    render(<ChainSendFlyout viaChain={false} onSend={vi.fn()} />);
    await longPress(screen.getByRole("button", { name: flyoutAriaLabel(0) }));

    expect(screen.queryByTestId(flyoutTestId(PRESET_MINUTES[0]))).toBeNull();
    expect(screen.queryByTestId(flyoutTestId(PRESET_MINUTES[1]))).toBeNull();
  });
});

describe("MessageBubble TTL mark", () => {
  it("shows a timer mark only when ttlExpiresAt is set", async () => {
    const { MessageBubble } = await import("@/components/MessageBubble");
    const base = {
      id: "m1",
      roomId: "r1",
      direction: "out" as const,
      text: "ttl",
      createdAt: new Date().toISOString(),
      status: "delivered" as const,
      channel: "relay" as const,
    };
    const { rerender } = render(
      <MessageBubble message={{ ...base, ttlExpiresAt: 1_700_000_000 }} />,
    );
    expect(screen.getByTitle("TTL")).toBeTruthy();
    rerender(<MessageBubble message={base} />);
    expect(screen.queryByTitle("TTL")).toBeNull();
  });
});
