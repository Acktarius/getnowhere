import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bestEffort, TimeoutError, withTimeout } from "@/lib/async/withTimeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });

  it("propagates the original rejection", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 100),
    ).rejects.toThrow("boom");
  });

  it("rejects with TimeoutError when the promise never settles", async () => {
    const pending = withTimeout(new Promise<void>(() => {}), 100, "revoke");
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});

describe("bestEffort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("swallows rejections", async () => {
    await expect(
      bestEffort(Promise.reject(new Error("x")), 100),
    ).resolves.toBeUndefined();
  });

  it("returns after the timeout when the promise hangs", async () => {
    const done = vi.fn();
    void bestEffort(new Promise<void>(() => {}), 100).then(done);
    await vi.advanceTimersByTimeAsync(99);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledOnce();
  });
});
