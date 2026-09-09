/** Vitest stub for expo-file-system (avoid loading Expo native modules). */

const files = new Map<string, { text: string }>();

/** Clear in-memory file state between tests (module-level File caches). */
export function resetExpoFileSystemStub(): void {
  files.clear();
}

export class File {
  uri: string;

  constructor(parent: { uri?: string } | string, name?: string) {
    const base =
      typeof parent === "string" ? parent : (parent?.uri ?? "file:///");
    this.uri = name
      ? `${String(base).replace(/\/$/, "")}/${name}`
      : String(base);
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  textSync(): string {
    return files.get(this.uri)?.text ?? "";
  }

  write(content: string): void {
    files.set(this.uri, { text: content });
  }

  delete(): void {
    files.delete(this.uri);
  }
}

export const Paths = {
  document: { uri: "file:///mock-document" },
  cache: { uri: "file:///mock-cache" },
};
