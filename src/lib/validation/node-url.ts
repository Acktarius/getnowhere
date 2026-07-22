/** Conceal daemon proxy URLs must be HTTPS and use a trailing slash before RPC paths. */
export function normalizeNodeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

/** Non-blocking hints shown while the user edits the node URL field. */
export function getNodeUrlFormatHints(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];

  const hints: string[] = [];
  const isProxyPath = trimmed.startsWith("/");
  if (
    !isProxyPath &&
    !trimmed.toLowerCase().startsWith("https://") &&
    !trimmed.toLowerCase().startsWith("http://")
  ) {
    hints.push("URL must start with https:// (or /ccx-daemon/ in local dev)");
  }
  if (!trimmed.endsWith("/")) {
    hints.push("Add a trailing slash (/) at the end, e.g. …/daemon/");
  }
  return hints;
}

export function validateNodeUrlFormat(
  url: string,
): { ok: true; normalized: string } | { ok: false; errors: string[] } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, errors: ["Enter a node URL."] };
  }

  const isProxyPath = trimmed.startsWith("/");
  if (
    !isProxyPath &&
    !trimmed.toLowerCase().startsWith("https://") &&
    !trimmed.toLowerCase().startsWith("http://")
  ) {
    return {
      ok: false,
      errors: ["URL must start with https:// (or /ccx-daemon/ in local dev)"],
    };
  }

  return { ok: true, normalized: normalizeNodeUrl(trimmed) };
}

const NODE_TEST_TIMEOUT_MS = 10_000;

/** Probe `{nodeUrl}getheight` — same contract as the wallet daemon client. */
export async function testNodeUrlReachability(
  nodeUrl: string,
): Promise<number> {
  const { resolveDaemonNodeUrl } = await import("@/lib/config");
  const normalized = normalizeNodeUrl(resolveDaemonNodeUrl(nodeUrl));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NODE_TEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalized}getheight`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Node returned HTTP ${response.status}.`);
    }

    const data = (await response.json()) as {
      status?: string;
      height?: number | string;
    };
    if (data.status !== "OK") {
      throw new Error(`Node status is not OK (${data.status ?? "unknown"}).`);
    }

    const height = parseInt(String(data.height), 10);
    if (!Number.isFinite(height) || height < 0) {
      throw new Error("Node returned an invalid blockchain height.");
    }

    return height;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Node did not respond in time.");
    }
    if (error instanceof Error) {
      throw new Error(`Could not reach node: ${error.message}`);
    }
    throw new Error("Could not reach node.");
  } finally {
    clearTimeout(timeoutId);
  }
}
