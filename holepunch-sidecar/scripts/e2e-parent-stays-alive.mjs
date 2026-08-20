/**
 * Product-loop: ephemeral IPC sidecar must stay up while parent lives.
 * Prints parent-stays-alive-ok on success.
 * Catches the v0.1.7 regression where parent-death false-killed the bridge.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, "..", "src", "server.mjs");
const holdMs = 2000;

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    HOLEPUNCH_HOST: "127.0.0.1",
    HOLEPUNCH_PORT: "0",
    GNH_SIDECAR_TOKEN: "stay-alive-token",
    GNH_PARENT_POLL_MS: "200",
    GNH_DISABLE_DISCOVERY: "1",
  },
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});

let exitedEarly = null;
child.on("exit", (code, signal) => {
  exitedEarly = { code, signal };
});

const msg = await new Promise((resolve, reject) => {
  const t = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("timeout waiting for listening IPC"));
  }, 10000);
  child.on("message", (m) => {
    clearTimeout(t);
    resolve(m);
  });
  child.on("exit", (code) => {
    clearTimeout(t);
    reject(new Error(`sidecar exited before listening: ${code}`));
  });
});

if (msg?.type !== "listening" || !(msg.port > 0)) {
  child.kill("SIGKILL");
  console.error("unexpected listening message", msg);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, holdMs));

if (exitedEarly) {
  console.error(
    `sidecar exited while parent lived: code=${exitedEarly.code} signal=${exitedEarly.signal}`,
  );
  process.exit(1);
}

child.kill("SIGTERM");
await new Promise((r) => child.once("exit", r));
console.log("parent-stays-alive-ok");
