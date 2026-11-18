export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Reject with `TimeoutError` if `promise` has not settled within `ms`. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Await `promise` but never throw or hang: resolves `undefined` on error or timeout. */
export async function bestEffort(
  promise: Promise<unknown>,
  ms: number,
  label?: string,
): Promise<void> {
  try {
    await withTimeout(promise, ms, label);
  } catch {
    /* best-effort step */
  }
}
