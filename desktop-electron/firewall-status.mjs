/**
 * Privilege-free, best-effort Linux UFW advisory for the Electron main
 * process. Never invokes `sudo`, never mutates firewall rules, never reads
 * the full ruleset, and never blocks startup on a permission failure.
 * @see docs/architecture/electron-desktop.md
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** @typedef {"active" | "inactive" | "unknown"} UfwState */
/** @typedef {{ state: UfwState, reason: string }} UfwAdvisory */

/**
 * Query `systemctl is-active ufw` — readable by any user, never requires
 * root, and never mutates rules (unlike `ufw status`, which needs root).
 * @param {string} platform
 * @param {(cmd: string, args: string[]) => Promise<{ stdout: string }>} runner
 * @returns {Promise<UfwAdvisory>}
 */
export async function getUfwAdvisory(
  platform = process.platform,
  runner = (cmd, args) => execFileAsync(cmd, args),
) {
  if (platform !== "linux") {
    return { state: "unknown", reason: "not-linux" };
  }

  try {
    const { stdout } = await runner("systemctl", ["is-active", "ufw"]);
    return classify(stdout);
  } catch (error) {
    if (error && typeof error === "object") {
      if (error.code === "ENOENT") {
        return { state: "unknown", reason: "no-systemctl" };
      }
      // `systemctl is-active` exits non-zero for inactive/failed units but
      // still reports the state on stdout — that is a confident result.
      if (typeof error.stdout === "string" && error.stdout.trim()) {
        return classify(error.stdout);
      }
      if (error.code === "EACCES") {
        return { state: "unknown", reason: "permission-denied" };
      }
    }
    return { state: "unknown", reason: "check-failed" };
  }
}

/** @param {string} rawStdout @returns {UfwAdvisory} */
function classify(rawStdout) {
  const value = rawStdout.trim();
  if (value === "active") return { state: "active", reason: "systemd" };
  if (value === "inactive" || value === "failed") {
    return { state: "inactive", reason: "systemd" };
  }
  return { state: "unknown", reason: `systemd:${value || "empty"}` };
}
