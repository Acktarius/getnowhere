import { vi } from "vitest";

/** Vitest stub for expo-sharing. */
export const isAvailableAsync = vi.fn(async () => true);
export const shareAsync = vi.fn(async () => undefined);
