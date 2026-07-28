/**
 * Exit when the Electron (or other) parent process dies.
 * @see specs/changes/packaged-desktop-identity/design.md D6
 */

/**
 * @param {{
 *   getPpid?: () => number,
 *   exit?: (code?: number) => void,
 *   intervalMs?: number,
 *   onDeath?: () => void | Promise<void>,
 * }} [opts]
 * @returns {() => void} stop
 */
export function startParentDeathWatch(opts = {}) {
  const getPpid = opts.getPpid ?? (() => process.ppid);
  const exit = opts.exit ?? ((code = 1) => process.exit(code));
  const intervalMs = opts.intervalMs ?? 1000;
  const onDeath = opts.onDeath;
  const initial = getPpid();

  const timer = setInterval(() => {
    const ppid = getPpid();
    // Linux: reparented to init (1) after parent death; also catch ppid change.
    if (ppid === 1 || ppid !== initial) {
      clearInterval(timer);
      void Promise.resolve(onDeath?.())
        .catch(() => {})
        .finally(() => exit(1));
    }
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
