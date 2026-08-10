export type DownloadJsonResult = "downloaded" | "saved";

/** Save JSON locally; desktop uses anchor download, mobile uses native file save. */
export async function downloadJson(
  filename: string,
  data: unknown,
): Promise<DownloadJsonResult> {
  const json = JSON.stringify(data, null, 2);

  if (window.gnhMobile?.saveTextFile) {
    await saveViaMobileBridge(filename, json);
    return "saved";
  }

  downloadViaAnchor(filename, json);
  return "downloaded";
}

function downloadViaAnchor(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function saveViaMobileBridge(filename: string, content: string): Promise<void> {
  const mobile = window.gnhMobile;
  const saveTextFile = mobile?.saveTextFile;
  const onSaveTextFile = mobile?._onSaveTextFile;
  if (!saveTextFile || !onSaveTextFile) {
    throw new Error("Mobile save is unavailable");
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      off();
      reject(new Error("Save timed out"));
    }, 120_000);

    const off = onSaveTextFile((result) => {
      if (result.requestId !== requestId) return;
      window.clearTimeout(timer);
      off();
      if (result.ok) resolve();
      else reject(new Error(result.message ?? "Could not save file"));
    });

    saveTextFile({ filename, content, requestId });
  });
}
