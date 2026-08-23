/** APNs HTTP/2 adapter. Alert payload is fixed; no custom data. @see docs/features/peer-wake-notification.md */

import { readFileSync } from "node:fs";
import { connect, type OutgoingHttpHeaders } from "node:http2";
import jwt from "jsonwebtoken";
import type { PushEnv } from "./db.js";

const JWT_TTL_MS = 50 * 60 * 1000;
const EXPIRATION_SEC = 3600;
const REQUEST_TIMEOUT_MS = 15_000;

export type PushResult = { ok: true } | { ok: false; unregistered: boolean };

export class PushConfigError extends Error {
  constructor(service: "apns" | "fcm") {
    super(service);
    this.name = "PushConfigError";
  }
}

type JwtCache = { token: string; expMs: number };

let jwtCache: JwtCache | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new PushConfigError("apns");
  return value;
}

function hostFor(env: PushEnv): string {
  return env === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}

function signJwt(): string {
  const teamId = requireEnv("APNS_TEAM_ID");
  const keyId = requireEnv("APNS_KEY_ID");
  const key = readFileSync(requireEnv("APNS_KEY_PATH"), "utf8");
  const iat = Math.floor(Date.now() / 1000);
  return jwt.sign({ iss: teamId, iat }, key, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: keyId },
    noTimestamp: true,
  });
}

function getJwt(): string {
  const now = Date.now();
  if (jwtCache && now < jwtCache.expMs) return jwtCache.token;
  const token = signJwt();
  jwtCache = { token, expMs: now + JWT_TTL_MS };
  return token;
}

function http2Post(
  host: string,
  path: string,
  headers: OutgoingHttpHeaders,
  body: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const client = connect(`https://${host}`);

    const finish = (err: Error | undefined, status: number) => {
      if (settled) return;
      settled = true;
      client.close();
      if (err) reject(err);
      else resolve(status);
    };

    client.on("error", (err) => finish(err, 0));

    const req = client.request({
      ":method": "POST",
      ":path": path,
      ":scheme": "https",
      ":authority": host,
      ...headers,
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.close();
      finish(new Error("apns_timeout"), 0);
    });

    let status = 0;
    req.on("response", (hs) => {
      status = Number(hs[":status"] ?? 0);
    });
    req.resume();
    req.on("error", (err) => finish(err, 0));
    req.on("end", () => finish(undefined, status));
    req.end(body);
  });
}

export async function sendApns(
  token: string,
  env: PushEnv,
): Promise<PushResult> {
  const topic = requireEnv("APNS_BUNDLE_ID");
  const expiration = Math.floor(Date.now() / 1000) + EXPIRATION_SEC;
  const status = await http2Post(
    hostFor(env),
    `/3/device/${encodeURIComponent(token)}`,
    {
      authorization: `bearer ${getJwt()}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(expiration),
      "apns-collapse-id": "gnh-poke",
      "content-type": "application/json",
    },
    JSON.stringify({
      aps: {
        alert: { title: "Get NowHere", body: "New message" },
        sound: "default",
      },
    }),
  );

  if (status === 200) return { ok: true };
  if (status === 410) return { ok: false, unregistered: true };
  return { ok: false, unregistered: false };
}
