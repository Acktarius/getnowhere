/**
 * Product-loop helper: bind conflict must exit non-zero.
 * Prints bind-conflict-ok on success.
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, "..", "src", "server.mjs");

const holder = createServer();
const port = await new Promise((resolve, reject) => {
  holder.listen(0, "127.0.0.1", () => {
    const addr = holder.address();
    if (!addr || typeof addr === "string") reject(new Error("no addr"));
    else resolve(addr.port);
  });
});

const child = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    HOLEPUNCH_HOST: "127.0.0.1",
    HOLEPUNCH_PORT: String(port),
    GNH_PARENT_POLL_MS: "60000",
    GNH_DISABLE_DISCOVERY: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let out = "";
child.stdout?.on("data", (c) => {
  out += String(c);
});
child.stderr?.on("data", (c) => {
  out += String(c);
});

const code = await new Promise((resolve) => {
  child.on("exit", (c) => resolve(c));
  setTimeout(() => {
    child.kill("SIGKILL");
    resolve(-1);
  }, 10000);
});

holder.close();

if (code === 0 || code === -1 || !/address already in use/i.test(out)) {
  console.error("fail", { code, out });
  process.exit(1);
}

console.log("bind-conflict-ok");
