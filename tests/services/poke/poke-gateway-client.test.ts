import { describe, expect, it } from "vitest";
import {
  apnsPushEnv,
  buildPokeRegisterBody,
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
