import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/state/authStore";

describe("authStore.init", () => {
  beforeEach(() => {
    useAuthStore.setState({ unlocked: false, busy: false, error: "stale" });
  });

  it("clears error without resetting app-access lock", async () => {
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().unlocked).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });
});
