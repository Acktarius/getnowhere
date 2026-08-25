/** HTTP routes. Logs are aggregates only — never handle, token, or IP. */

import type { FastifyInstance } from "fastify";
import { PushConfigError, sendApns } from "./apns.js";
import {
  createHandle,
  deleteHandle,
  getHandle,
  type Platform,
  type PushEnv,
  updateHandleToken,
} from "./db.js";
import { consumePokeSlot } from "./rateLimit.js";

const HANDLE_RE = /^[A-Za-z0-9_-]{14}$/;

type RegisterBody = {
  token: string;
  platform: Platform;
  env: PushEnv;
  /** Present on token rotation — updates existing mapping instead of minting new handle. */
  pokeHandle?: string;
};

type PokeBody = { to: string };
type UnregisterBody = { pokeHandle: string };

const registerSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["token", "platform", "env"],
    properties: {
      token: { type: "string", minLength: 1, maxLength: 4096 },
      platform: { type: "string", enum: ["apns"] },
      env: { type: "string", enum: ["sandbox", "production"] },
      pokeHandle: { type: "string", minLength: 14, maxLength: 14 },
    },
  },
} as const;

const pokeSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["to"],
    properties: {
      to: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
} as const;

const unregisterSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["pokeHandle"],
    properties: {
      pokeHandle: { type: "string", minLength: 1, maxLength: 32 },
    },
  },
} as const;

export function registerRoutes(app: FastifyInstance): void {
  app.setErrorHandler((error, _req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: "bad_request" });
    }
    app.log.error({ event: "error", status });
    return reply.code(500).send({ error: "internal" });
  });

  app.get("/health", async () => ({ ok: true as const }));

  app.post<{ Body: RegisterBody }>(
    "/register",
    { schema: registerSchema },
    async (req, reply) => {
      const { token, platform, env, pokeHandle: existing } = req.body;
      // Token rotation: if client supplies its existing handle, upsert the token.
      if (existing && HANDLE_RE.test(existing)) {
        const updated = updateHandleToken(existing, token);
        if (updated) {
          app.log.info({ event: "register_update" });
          return reply.code(200).send({ pokeHandle: existing });
        }
        // Handle unknown (e.g. after server DB reset) — fall through to mint fresh.
      }
      const pokeHandle = createHandle({ token, platform, env });
      app.log.info({ event: "register" });
      return reply.code(200).send({ pokeHandle });
    },
  );

  app.post<{ Body: PokeBody }>(
    "/poke",
    { schema: pokeSchema },
    async (req, reply) => {
      const to = req.body.to;
      if (!HANDLE_RE.test(to)) {
        return reply.code(400).send({ error: "bad_request" });
      }
      if (!consumePokeSlot(to)) {
        app.log.info({ event: "poke", result: "rate_limited" });
        return reply.code(429).send({ error: "rate_limited" });
      }

      const row = getHandle(to);
      if (!row) {
        const base = process.env.NTFY_BASE_URL;
        const token = process.env.NTFY_PUBLISH_TOKEN;
        if (base && token) {
          try {
            await fetch(`${base}/gnh-${to}`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "text/plain",
              },
              body: "wake",
            });
            app.log.info({ event: "poke", result: "ntfy_sent" });
          } catch {
            app.log.info({ event: "poke", result: "ntfy_failed" });
          }
        } else {
          app.log.info({ event: "poke", result: "ntfy_noop" });
        }
        return reply.code(202).send();
      }

      try {
        const result = await sendApns(row.token, row.env);
        if (result.ok) {
          app.log.info({ event: "poke", result: "sent" });
          return reply.code(202).send();
        }
        if (result.unregistered) {
          deleteHandle(to);
          app.log.info({ event: "poke", result: "unregistered" });
          return reply.code(202).send();
        }
        app.log.error({ event: "poke", result: "push_failed" });
        return reply.code(502).send({ error: "push_failed" });
      } catch (err) {
        if (err instanceof PushConfigError) {
          app.log.error({ event: "poke", result: "push_unavailable" });
          return reply.code(503).send({ error: "push_unavailable" });
        }
        app.log.error({ event: "poke", result: "push_failed" });
        return reply.code(502).send({ error: "push_failed" });
      }
    },
  );

  app.delete<{ Body: UnregisterBody }>(
    "/register",
    { schema: unregisterSchema },
    async (req, reply) => {
      const pokeHandle = req.body.pokeHandle;
      if (!HANDLE_RE.test(pokeHandle)) {
        return reply.code(400).send({ error: "bad_request" });
      }
      deleteHandle(pokeHandle);
      app.log.info({ event: "unregister" });
      return reply.code(204).send();
    },
  );
}
