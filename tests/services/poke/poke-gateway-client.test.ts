import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apnsPushEnv,
  buildPokeRegisterBody,
  sendPoke,
} from "@/services/poke/pokeGatewayClient";

describe("poke gateway register body", () => {
  it("includes env so the gateway can send APNs (schema requires it)", () => {
    expect(apnsPushEnv()).toBe("production");
    expect(buildPokeRegisterBody("apns", "device-token", null)).toEqual({
      platform: "apns",
      token: "device-token",
      env: "production",
    });
  });

  it("keeps env when rotating an existing handle", () => {
    expect(
      buildPokeRegisterBody("apns", "new-token", "abcdefghijklmn"),
    ).toEqual({
      platform: "apns",
      token: "new-token",
      env: "production",
      pokeHandle: "abcdefghijklmn",
    });
  });
});

describe("sendPoke", () => {
  const GATEWAY = "https://poke.test.invalid";
  const fixtureHandle = "k7mNpQrStUvWxY";
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_POKE_GATEWAY_URL", GATEWAY);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts only { to } so the deployed gateway accepts the body", async () => {
    await sendPoke(fixtureHandle);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe(`${GATEWAY}/poke`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ to: fixtureHandle });
    expect(JSON.parse(init.body)).not.toHaveProperty("kind");
  });

  it("is a no-op when the gateway URL is unset", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_POKE_GATEWAY_URL", "");
    await sendPoke(fixtureHandle);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
