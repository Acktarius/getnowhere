/**
 * Product-loop helper: spawn sidecar with IPC + HOLEPUNCH_PORT=0.
 * Prints ephemeral-ipc-ok on success.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, "..", "src", "server.mjs");

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    HOLEPUNCH_HOST: "127.0.0.1",
    HOLEPUNCH_PORT: "0",
    GNH_PARENT_POLL_MS: "60000",
    GNH_DISABLE_DISCOVERY: "1",
  },
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});

const msg = await new Promise((resolve, reject) => {
  const t = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("timeout"));
  }, 10000);
  child.on("message", (m) => {
    clearTimeout(t);
    resolve(m);
  });
  child.on("exit", (code) => {
    clearTimeout(t);
    reject(new Error(`exit ${code}`));
  });
});

if (msg?.type !== "listening" || !(msg.port > 0) || msg.port === 7901) {
  child.kill("SIGKILL");
  console.error("unexpected", msg);
  process.exit(1);
}

child.kill("SIGTERM");
await new Promise((r) => child.once("exit", r));
console.log("ephemeral-ipc-ok");
