import {
  isMobileAndroid,
  isMobileHost,
} from "@/lib/mobile/gnhMobileBridgeTypes";
import { useSettingsStore } from "@/state/settingsStore";
import { toastError, toastInfo } from "@/state/toastStore";

const COPY_FAILED = "Copy failed";
const CLEAR_FAILED = "Clear clipboard failed";
const CLEARED = "Clipboard cleared.";
const REMINDER = "You copied a sensitive value.";
const CLEAR_HINT =
  "When you are done pasting, use Clear clipboard in Privacy settings.";
const NATIVE_MS = 2000;

function showReminderIfEnabled(): void {
  if (!useSettingsStore.getState().privacy.clearClipboardWarnings) return;
  const extra =
    isMobileAndroid() || window.gnhDesktop != null ? ` ${CLEAR_HINT}` : "";
  toastInfo(`${REMINDER}${extra}`);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Prefer native; fall back to the Clipboard API if native is missing or hung. */
async function writeHost(value: string): Promise<void> {
  const nativeCopy = window.gnhMobile?.copySensitive;
  if (isMobileHost() && typeof nativeCopy === "function") {
    try {
      await withTimeout(nativeCopy(value), NATIVE_MS);
      return;
    } catch {
      /* native missing, rejected, or hung */
    }
  }
  await navigator.clipboard.writeText(value);
}

async function clearHost(): Promise<void> {
  const nativeClear = window.gnhMobile?.clearClipboard;
  if (isMobileHost() && typeof nativeClear === "function") {
    try {
      await withTimeout(nativeClear(), NATIVE_MS);
      return;
    } catch {
      /* native missing, rejected, or hung */
    }
  }
  await navigator.clipboard.writeText("");
}

/** Write only the raw identifier. Reminder toast never includes the value. */
export async function copySensitive(value: string): Promise<void> {
  try {
    await writeHost(value);
  } catch {
    toastError(COPY_FAILED);
    throw new Error(COPY_FAILED);
  }
  showReminderIfEnabled();
}

/** Overwrite the clipboard. Does not read or retain a compare value. */
export async function clearClipboard(): Promise<void> {
  try {
    await clearHost();
  } catch {
    toastError(CLEAR_FAILED);
    throw new Error(CLEAR_FAILED);
  }
  toastInfo(CLEARED);
}
