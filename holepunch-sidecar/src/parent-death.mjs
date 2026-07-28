/**
 * Exit when the Electron (or other) parent process dies.
 * @see specs/changes/packaged-desktop-identity/design.md D6
 * @see docs/architecture/holepunch-sidecar.md
 */

/**
 * True while `pid` still exists. `kill(pid, 0)` → ESRCH = gone; EPERM = alive
 * but unsignalable. Never call with ≤1 (`kill(0,…)` hits the process group).
 * @param {number} pid
 */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === "EPERM";
  }
}

/**
 * Exit only when the start-time parent PID is gone.
 * Do **not** key off bare `process.ppid` changes — that false-killed the
 * packaged sidecar under Electron (v0.1.7 regression vs v0.1.6).
 * @param {{
 *   getPpid?: () => number,
 *   parentAlive?: (pid: number) => boolean,
 *   exit?: (code?: number) => void,
 *   intervalMs?: number,
 *   onDeath?: () => void | Promise<void>,
 *   onSkip?: (reason: string) => void,
 * }} [opts]
 * @returns {() => void} stop
 */
export function startParentDeathWatch(opts = {}) {
  const getPpid = opts.getPpid ?? (() => process.ppid);
  const parentAlive = opts.parentAlive ?? isPidAlive;
  const exit = opts.exit ?? ((code = 1) => process.exit(code));
  const intervalMs = opts.intervalMs ?? 1000;
  const onDeath = opts.onDeath;
  const initial = getPpid();

  if (!parentAlive(initial)) {
    opts.onSkip?.(
      `parent pid ${initial} not usable — watch not started (avoids false exit)`,
    );
    return () => {};
  }

  const timer = setInterval(() => {
    if (parentAlive(initial)) return;
    clearInterval(timer);
    void Promise.resolve(onDeath?.())
      .catch(() => {})
      .finally(() => exit(1));
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
