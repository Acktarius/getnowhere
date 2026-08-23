/** Poke gateway entry: Fastify + SQLite. @see docs/features/peer-wake-notification.md */

import Fastify from "fastify";
import { closeDb, openDb } from "./db.js";
import { pruneRateLimits } from "./rateLimit.js";
import { registerRoutes } from "./routes.js";

const port = Number(process.env.PORT ?? 3456);
const dbPath = process.env.DB_PATH ?? "./poke.db";

openDb(dbPath);

const app = Fastify({
  disableRequestLogging: true,
  logger: {
    level: "info",
    serializers: {
      req: () => ({}),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  },
});

registerRoutes(app);

const pruneTimer = setInterval(() => {
  pruneRateLimits();
}, 60_000);
pruneTimer.unref();

async function shutdown(): Promise<void> {
  clearInterval(pruneTimer);
  await app.close();
  closeDb();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

await app.listen({ port, host: "0.0.0.0" });
app.log.info({ event: "listen", port });
