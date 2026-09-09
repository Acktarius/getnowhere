import { vi } from "vitest";

/** Vitest stub for expo-file-system/legacy SAF APIs. */
export const StorageAccessFramework = {
  getUriForDirectoryInRoot: vi.fn((name: string) => `content://root/${name}`),
  requestDirectoryPermissionsAsync: vi.fn(async () => ({
    granted: true,
    directoryUri: "content://tree/primary%3ADownload",
  })),
  createFileAsync: vi.fn(
    async (_dir: string, baseName: string, _mime: string) =>
      `content://tree/primary/document/${baseName}.json`,
  ),
  writeAsStringAsync: vi.fn(async () => undefined),
};
