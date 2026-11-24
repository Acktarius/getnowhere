import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apnsResult, PushConfigError, signJwt } from "../src/apns.js";

const TEAM_ID = "TEAM123456";
const KEY_ID = "KEY1234567";

describe("signJwt", () => {
  let dir: string;
  let publicKey: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "apns-test-"));
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    publicKey = pair.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const keyPath = join(dir, "AuthKey.p8");
    writeFileSync(
      keyPath,
      pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    process.env.APNS_TEAM_ID = TEAM_ID;
    process.env.APNS_KEY_ID = KEY_ID;
    process.env.APNS_KEY_PATH = keyPath;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.APNS_TEAM_ID;
    delete process.env.APNS_KEY_ID;
    delete process.env.APNS_KEY_PATH;
  });

  it("signs an ES256 token with kid, iss and a current iat", () => {
    const now = Math.floor(Date.now() / 1000);
    const decoded = jwt.verify(signJwt(), publicKey, {
      algorithms: ["ES256"],
      complete: true,
    });

    expect(decoded.header.kid).toBe(KEY_ID);
    expect(decoded.payload).toMatchObject({ iss: TEAM_ID });
    const { iat } = decoded.payload as { iat?: number };
    expect(iat).toBeGreaterThanOrEqual(now - 5);
    expect(iat).toBeLessThanOrEqual(now + 5);
  });

  it("throws PushConfigError when the key file is unreadable", () => {
    process.env.APNS_KEY_PATH = join(dir, "missing.p8");
    expect(() => signJwt()).toThrow(PushConfigError);
  });
});

describe("apnsResult", () => {
  it("is ok on 200", () => {
    expect(apnsResult(200, "")).toEqual({ ok: true });
  });

  it("marks 410 as unregistered", () => {
    expect(apnsResult(410, '{"reason":"Unregistered"}')).toEqual({
      ok: false,
      unregistered: true,
      status: 410,
      reason: "Unregistered",
    });
  });

  it("keeps Apple's status and reason on other failures", () => {
    expect(apnsResult(403, '{"reason":"InvalidProviderToken"}')).toEqual({
      ok: false,
      unregistered: false,
      status: 403,
      reason: "InvalidProviderToken",
    });
  });

  it("tolerates a body that is not JSON", () => {
    expect(apnsResult(500, "oops")).toEqual({
      ok: false,
      unregistered: false,
      status: 500,
      reason: undefined,
    });
  });
});
