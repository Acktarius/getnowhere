/**
 * Daemon fetch that buffers the body before it resolves.
 * The SDK abort timer stops when `fetch` returns; `response.json()` then has no deadline.
 * @see docs/features/lite-wallet.md
 */

/** One daemon HTTP call, including the response body. */
export const DAEMON_REQUEST_TIMEOUT_MS = 30_000;

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function concatChunks(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Reject when `signal` aborts, without waiting for a body read that ignores cancellation. */
function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal | null,
  onAbort: () => void,
): Promise<T> {
  if (!signal) return work;
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const fail = () => {
      onAbort();
      reject(abortError());
    };
    signal.addEventListener("abort", fail, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", fail);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", fail);
        reject(signal.aborted || isAbort(error) ? abortError() : error);
      },
    );
  });
}

async function bufferBody(
  response: Response,
  signal: AbortSignal | null,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    throwIfAborted(signal);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  const cancel = () => {
    void reader.cancel(abortError()).catch(() => {});
  };
  try {
    while (true) {
      const step = await raceAbort(reader.read(), signal, cancel);
      if (step.done) break;
      if (step.value) chunks.push(step.value);
    }
  } catch (error) {
    cancel();
    if (signal?.aborted || isAbort(error)) throw abortError();
    throw error;
  }
  throwIfAborted(signal);
  return concatChunks(chunks);
}

/**
 * Buffer the body under `signal`, and race the initial fetch the same way.
 * An abort rejects with `AbortError` even when the WebView ignores cancellation.
 */
export async function fetchWithBufferedBody(
  base: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const signal = init?.signal ?? null;
  throwIfAborted(signal);
  const response = await raceAbort(base(input, init), signal, () => {});
  const bytes = await bufferBody(response, signal);
  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** `fetch` passed to `createDaemonClient`. Buffers each body under the SDK abort signal. */
export function daemonFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetchWithBufferedBody(globalThis.fetch.bind(globalThis), input, init);
}
