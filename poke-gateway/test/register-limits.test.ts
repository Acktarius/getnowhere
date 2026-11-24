import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetRegisterRateLimitsForTests,
  consumeRegisterSlot,
  pruneRateLimits,
  REGISTER_GLOBAL_BURST,
  REGISTER_IP_BURST,
  REGISTER_IP_REFILL_MS,
} from "../src/rateLimit.js";
import { registerRoutes, trustOneProxy } from "../src/routes.js";

vi.mock("../src/db.js", () => ({
  getHandle: vi.fn(),
  createHandle: vi.fn(() => "abcdefghijklmn"),
  deleteHandle: vi.fn(),
  deleteHandleIfExpired: vi.fn(),
  isHandleExpired: vi.fn(),
  updateHandleToken: vi.fn(),
}));

vi.mock("../src/apns.js", () => ({
  sendApns: vi.fn(),
  PushConfigError: class PushConfigError extends Error {},
}));

const IP_A = "198.51.100.7";
const IP_B = "198.51.100.8";

afterEach(() => {
  _resetRegisterRateLimitsForTests();
});

describe("register rate limits", () => {
  it("allows a per-IP burst, then rejects that IP but not another", () => {
    const now = 1_000_000;
    for (let i = 0; i < REGISTER_IP_BURST; i++) {
      expect(consumeRegisterSlot(IP_A, now)).toBe(true);
    }
    expect(consumeRegisterSlot(IP_A, now)).toBe(false);
    expect(consumeRegisterSlot(IP_B, now)).toBe(true);
  });

  it("refills one per-IP slot per refill interval", () => {
    const now = 2_000_000;
    for (let i = 0; i < REGISTER_IP_BURST; i++) consumeRegisterSlot(IP_A, now);
    expect(consumeRegisterSlot(IP_A, now)).toBe(false);
    expect(consumeRegisterSlot(IP_A, now + REGISTER_IP_REFILL_MS)).toBe(true);
  });

  it("caps all IPs together with a global burst", () => {
    const now = 3_000_000;
    let allowed = 0;
    for (let i = 0; i < REGISTER_GLOBAL_BURST + 5; i++) {
      if (consumeRegisterSlot(`203.0.113.${i}`, now)) allowed += 1;
    }
    expect(allowed).toBe(REGISTER_GLOBAL_BURST);
  });

  it("prunes per-IP entries once their bucket has refilled", () => {
    const now = 4_000_000;
    consumeRegisterSlot(IP_A, now);
    const full = now + REGISTER_IP_BURST * REGISTER_IP_REFILL_MS;
    expect(pruneRateLimits(full)).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /register over the limit", () => {
  function buildApp() {
    const app = Fastify({ logger: false, trustProxy: trustOneProxy });
    registerRoutes(app);
    return app;
  }

  it("returns 429 with Retry-After for the rightmost forwarded client IP", async () => {
    const app = buildApp();
    const register = (forwardedFor: string) =>
      app.inject({
        method: "POST",
        url: "/register",
        headers: { "x-forwarded-for": forwardedFor },
        payload: { token: "t", platform: "apns", env: "production" },
      });
    for (let i = 0; i < REGISTER_IP_BURST; i++) {
      expect((await register(`10.9.9.${i}, ${IP_A}`)).statusCode).toBe(200);
    }
    const limited = await register(`10.9.9.99, ${IP_A}`);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect((await register(IP_B)).statusCode).toBe(200);
  });
});
