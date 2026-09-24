import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apnsPushEnv,
  buildPokeRegisterBody,
  deletePokeHandle,
  getOwnPokeHandle,
  registerPokeHandle,
  sendPoke,
} from "@/services/poke/pokeGatewayClient";
import {
  type StorageAdapter,
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";

function createMemoryAdapter(): StorageAdapter & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

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

describe("own pokeHandle storage (SEC-2026-026)", () => {
  const GATEWAY = "https://poke.test.invalid";
  let adapter: ReturnType<typeof createMemoryAdapter>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    adapter = createMemoryAdapter();
    setActiveStorageAdapter(adapter);
    vi.stubEnv("VITE_POKE_GATEWAY_URL", GATEWAY);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setActiveStorageAdapter(webStorageAdapter);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("caches the handle through the active StorageAdapter, not raw localStorage", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ pokeHandle: "k7mNpQrStUvWxY" }),
    });

    expect(getOwnPokeHandle()).toBeNull();
    await registerPokeHandle("apns", "device-token");

    expect(adapter.store.get("gnh.ownPokeHandle")).toBe("k7mNpQrStUvWxY");
    expect(getOwnPokeHandle()).toBe("k7mNpQrStUvWxY");
  });

  it("deletePokeHandle clears the adapter key even when the gateway call fails", async () => {
    adapter.setItem("gnh.ownPokeHandle", "k7mNpQrStUvWxY");
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(deletePokeHandle()).rejects.toThrow("network down");

    expect(getOwnPokeHandle()).toBeNull();
  });

  it("deletePokeHandle clears the adapter key on a successful revoke", async () => {
    adapter.setItem("gnh.ownPokeHandle", "k7mNpQrStUvWxY");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    await deletePokeHandle();

    expect(fetchMock).toHaveBeenCalledWith(
      `${GATEWAY}/register`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(getOwnPokeHandle()).toBeNull();
  });

  it("deletePokeHandle is a no-op when no handle is cached", async () => {
    await deletePokeHandle();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
