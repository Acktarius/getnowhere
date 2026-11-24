import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerRoutes } from "../src/routes.js";

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

const WEBVIEW_ORIGIN = "null";

function buildApp() {
  const app = Fastify({ logger: false });
  registerRoutes(app);
  return app;
}

describe("CORS for the app WebView", () => {
  it.each(["/register", "/poke"])(
    "answers the %s preflight with 204 and allow headers",
    async (url) => {
      const res = await buildApp().inject({
        method: "OPTIONS",
        url,
        headers: {
          origin: WEBVIEW_ORIGIN,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("*");
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
      expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
      expect(res.headers["access-control-allow-headers"]).toContain(
        "content-type",
      );
    },
  );

  it("adds the allow-origin header to real responses", async () => {
    const res = await buildApp().inject({
      method: "POST",
      url: "/register",
      headers: { origin: WEBVIEW_ORIGIN },
      payload: { token: "t", platform: "apns", env: "production" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("adds the allow-origin header to error responses", async () => {
    const res = await buildApp().inject({
      method: "POST",
      url: "/poke",
      headers: { origin: WEBVIEW_ORIGIN },
      payload: { to: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
