/**
 * WebView wallet backup export: Android SAF folder write; iOS share sheet.
 * @see docs/features/lite-wallet.md
 */
import { File, Paths } from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { SaveTextFileResult } from "./buildSaveTextFileResolveScript";

export type { SaveTextFileResult } from "./buildSaveTextFileResolveScript";
export { buildSaveTextFileResolveScript } from "./buildSaveTextFileResolveScript";

const SAVE_DIRECTORY_URI_FILE = new File(
  Paths.document,
  "gnh-wallet-save-directory-uri.txt",
);

function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").trim();
  if (!base || base === "." || base === "..") {
    return `getnowhere-wallet-${Date.now()}.json`;
  }
  return base.replace(/[^\w.\-+]/g, "_");
}

/** SAF createFileAsync expects a basename without extension. */
function filenameBaseWithoutExtension(name: string): string {
  const sanitized = sanitizeFilename(name);
  const dot = sanitized.lastIndexOf(".");
  if (dot <= 0) return sanitized;
  return sanitized.slice(0, dot);
}

function readCachedDirectoryUri(): string | null {
  if (!SAVE_DIRECTORY_URI_FILE.exists) return null;
  const uri = SAVE_DIRECTORY_URI_FILE.textSync().trim();
  return uri || null;
}

function writeCachedDirectoryUri(uri: string): void {
  if (SAVE_DIRECTORY_URI_FILE.exists) {
    SAVE_DIRECTORY_URI_FILE.delete();
  }
  SAVE_DIRECTORY_URI_FILE.write(uri);
}

function clearCachedDirectoryUri(): void {
  if (SAVE_DIRECTORY_URI_FILE.exists) {
    SAVE_DIRECTORY_URI_FILE.delete();
  }
}

async function requestDirectoryUri(): Promise<string> {
  const downloadsRoot =
    StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const permissions =
    await StorageAccessFramework.requestDirectoryPermissionsAsync(
      downloadsRoot,
    );
  if (!permissions.granted) {
    throw new Error("Save cancelled");
  }
  writeCachedDirectoryUri(permissions.directoryUri);
  return permissions.directoryUri;
}

async function resolveDirectoryUri(forceRepick: boolean): Promise<string> {
  if (!forceRepick) {
    const cached = readCachedDirectoryUri();
    if (cached) return cached;
  }
  return requestDirectoryUri();
}

async function saveToAndroidStorage(
  filename: string,
  content: string,
): Promise<void> {
  const baseName = filenameBaseWithoutExtension(filename);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const directoryUri = await resolveDirectoryUri(attempt > 0);
      const fileUri = await StorageAccessFramework.createFileAsync(
        directoryUri,
        baseName,
        "application/json",
      );
      await StorageAccessFramework.writeAsStringAsync(fileUri, content);
      return;
    } catch (err) {
      if (attempt === 0) {
        clearCachedDirectoryUri();
        continue;
      }
      throw err;
    }
  }
}

/** Write JSON under cache and present the iOS share sheet. */
async function saveToIosShare(
  filename: string,
  content: string,
): Promise<void> {
  const safeName = sanitizeFilename(filename);
  const cacheFile = new File(Paths.cache, safeName);
  if (cacheFile.exists) {
    cacheFile.delete();
  }
  cacheFile.write(content);

  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      throw new Error("Sharing is not available on this device");
    }
    await Sharing.shareAsync(cacheFile.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Save wallet backup",
    });
  } finally {
    try {
      if (cacheFile.exists) {
        cacheFile.delete();
      }
    } catch {
      // Best-effort cleanup of app-private cache.
    }
  }
}

/** Handle WebView `gnh-file` save command. Returns true when message was consumed. */
export function handleSaveTextFileWebViewMessage(
  raw: string,
  resolve: (result: SaveTextFileResult) => void,
): boolean {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  if (parsed.channel !== "gnh-file" || parsed.direction !== "command") {
    return false;
  }

  const requestId =
    typeof parsed.requestId === "string" ? parsed.requestId : "";
  const filename = typeof parsed.filename === "string" ? parsed.filename : "";
  const content = typeof parsed.content === "string" ? parsed.content : "";
  if (!requestId || !filename) {
    return true;
  }

  void (async () => {
    try {
      if (Platform.OS === "ios") {
        await saveToIosShare(filename, content);
      } else {
        await saveToAndroidStorage(filename, content);
      }
      resolve({ requestId, ok: true });
    } catch (err) {
      resolve({
        requestId,
        ok: false,
        message: err instanceof Error ? err.message : "Could not save file",
      });
    }
  })();

  return true;
}
