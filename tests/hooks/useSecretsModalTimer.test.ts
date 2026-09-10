import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FADE_MS,
  GRACE_MS,
  useSecretsModalTimer,
} from "@/hooks/useSecretsModalTimer";

describe("useSecretsModalTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables Need more time and zeros opacity when closed", () => {
    const { result } = renderHook(() =>
      useSecretsModalTimer({ open: false, onClose: () => undefined }),
    );

    expect(result.current.needMoreEnabled).toBe(false);
    expect(result.current.needMoreOpacity).toBe(0);
    expect(result.current.fadeMs).toBe(FADE_MS);
  });

  it("enables Need more time at fade and auto-closes after grace", async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSecretsModalTimer({ open: true, onClose }),
    );

    expect(result.current.needMoreEnabled).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FADE_MS - 1);
    });
    expect(result.current.needMoreEnabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.needMoreEnabled).toBe(true);
    expect(result.current.needMoreOpacity).toBe(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restarts the fade cycle when requestMoreTime is called", async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSecretsModalTimer({ open: true, onClose }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FADE_MS);
    });
    expect(result.current.needMoreEnabled).toBe(true);

    act(() => {
      result.current.requestMoreTime();
    });
    expect(result.current.needMoreEnabled).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FADE_MS - 1);
    });
    expect(result.current.needMoreEnabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.needMoreEnabled).toBe(true);
  });
});
