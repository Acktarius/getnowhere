/** APNs HTTP/2 adapter. Alert payload is fixed; no custom data. @see docs/features/peer-wake-notification.md */

import { readFileSync } from "node:fs";
import { connect, type OutgoingHttpHeaders } from "node:http2";
import jwt from "jsonwebtoken";
import type { PushEnv } from "./db.js";

const JWT_TTL_MS = 50 * 60 * 1000;
const EXPIRATION_SEC = 3600;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REPLY_CHARS = 1024;

export type PushResult =
  | { ok: true }
  | { ok: false; unregistered: boolean; status?: number; reason?: string };

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

function readKey(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new PushConfigError("apns");
  }
}

/** APNs provider token: ES256, `kid` header, `iss` + `iat` claims (APNs rejects a token without `iat`). */
export function signJwt(): string {
  const teamId = requireEnv("APNS_TEAM_ID");
  const keyId = requireEnv("APNS_KEY_ID");
  const key = readKey(requireEnv("APNS_KEY_PATH"));
  try {
    return jwt.sign({ iss: teamId }, key, { algorithm: "ES256", keyid: keyId });
  } catch {
    throw new PushConfigError("apns");
  }
}

/** Maps an APNs reply to a result; keeps Apple's status and `reason` for logs. */
export function apnsResult(status: number, body: string): PushResult {
  if (status === 200) return { ok: true };
  let reason: string | undefined;
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    if (typeof parsed.reason === "string") reason = parsed.reason;
  } catch {}
  return { ok: false, unregistered: status === 410, status, reason };
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
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBody = "";
    const client = connect(`https://${host}`);

    const finish = (err: Error | undefined, status: number) => {
      if (settled) return;
      settled = true;
      client.close();
      if (err) reject(err);
      else resolve({ status, body: responseBody });
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
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      if (responseBody.length < MAX_REPLY_CHARS) responseBody += chunk;
    });
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
  const { status, body } = await http2Post(
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

  return apnsResult(status, body);
}
