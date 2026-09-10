/**
 * Unit tests for /poke route: ntfy fallback, SSRF guard, APNs path, rate limit.
 * Uses vitest + Fastify inject. DB, APNs, and rateLimit are vi.mock'd.
 */

import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRoutes } from "./routes.js";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("./db.js", () => ({
  getHandle: vi.fn(),
  createHandle: vi.fn(),
  deleteHandle: vi.fn(),
  updateHandleToken: vi.fn(),
  openDb: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock("./apns.js", () => ({
  sendApns: vi.fn(),
  PushConfigError: class PushConfigError extends Error {},
}));

vi.mock("./rateLimit.js", () => ({
  consumePokeSlot: vi.fn(),
  pruneRateLimits: vi.fn(),
}));

import { sendApns } from "./apns.js";
import { getHandle } from "./db.js";
import { consumePokeSlot } from "./rateLimit.js";

const VALID_TO = "abcdefghijklmn"; // 14 chars, matches HANDLE_RE

function buildApp() {
  const app = Fastify({ logger: false });
  registerRoutes(app);
  return app;
}

describe("/poke route", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    app = buildApp();
    vi.mocked(consumePokeSlot).mockReturnValue(true);
    // Default: no ntfy env vars
    delete process.env.NTFY_BASE_URL;
    delete process.env.NTFY_PUBLISH_TOKEN;
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ── SSRF guard ──────────────────────────────────────────────────────────────

  it("returns 400 when `to` fails SSRF guard (too short)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: "abc" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when `to` fails SSRF guard (path traversal)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: "../evil" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Rate limit ──────────────────────────────────────────────────────────────

  it("returns 429 when rate limit is exceeded", async () => {
    vi.mocked(consumePokeSlot).mockReturnValue(false);
    vi.mocked(getHandle).mockReturnValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });
    expect(res.statusCode).toBe(429);
  });

  // ── ntfy fallback on DB miss ────────────────────────────────────────────────

  it("calls ntfy with correct URL, auth header, and body on DB miss", async () => {
    process.env.NTFY_BASE_URL = "https://ntfy.example.com";
    process.env.NTFY_PUBLISH_TOKEN = "tok_secret";
    vi.mocked(getHandle).mockReturnValue(undefined);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });

    expect(res.statusCode).toBe(202);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://ntfy.example.com/gnh-${VALID_TO}`);
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok_secret",
    );
    expect(opts.body).toBe("wake");

    vi.unstubAllGlobals();
  });

  it("returns 202 but does NOT call fetch when ntfy env vars are missing", async () => {
    vi.mocked(getHandle).mockReturnValue(undefined);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });

    expect(res.statusCode).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("still returns 202 when ntfy POST fails (best-effort)", async () => {
    process.env.NTFY_BASE_URL = "https://ntfy.example.com";
    process.env.NTFY_PUBLISH_TOKEN = "tok_secret";
    vi.mocked(getHandle).mockReturnValue(undefined);

    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });

    expect(res.statusCode).toBe(202);
    vi.unstubAllGlobals();
  });

  // ── APNs path ───────────────────────────────────────────────────────────────

  it("returns 202 (not 204) on APNs success", async () => {
    vi.mocked(getHandle).mockReturnValue({
      pokeHandle: VALID_TO,
      token: "apns-tok",
      env: "production",
      platform: "apns",
      updatedAt: 0,
    });
    vi.mocked(sendApns).mockResolvedValue({ ok: true });

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });

    expect(res.statusCode).toBe(202);
  });

  it("returns 202 (not 204) when APNs reports unregistered token", async () => {
    vi.mocked(getHandle).mockReturnValue({
      pokeHandle: VALID_TO,
      token: "apns-tok",
      env: "production",
      platform: "apns",
      updatedAt: 0,
    });
    vi.mocked(sendApns).mockResolvedValue({ ok: false, unregistered: true });

    const res = await app.inject({
      method: "POST",
      url: "/poke",
      payload: { to: VALID_TO },
    });

    expect(res.statusCode).toBe(202);
  });
});
