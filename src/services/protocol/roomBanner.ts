import type { RoomLifecycleStatus } from "@/types/models";

export type RoomBannerTone = "connecting" | "offline" | "error";

export type RoomBanner = {
  hidden: boolean;
  text: string;
  tone: RoomBannerTone;
};

const TERMINAL_TEXT: Partial<Record<RoomLifecycleStatus, string>> = {
  declined: "Invite declined",
  expired: "Room expired",
  failed: "Room failed",
  closed: "Room closed",
  destroyed: "Room destroyed",
};

/** Single-line chat room status under the header; hidden once L2 is connected. */
export function roomBannerModel(input: {
  lifecycleStatus: RoomLifecycleStatus;
  lastConnectError?: string;
  alias: string;
  openingRoom?: boolean;
}): RoomBanner {
  const { lifecycleStatus, lastConnectError, alias, openingRoom } = input;
  const looking: RoomBanner = {
    hidden: false,
    text: `Looking for ${alias}…`,
    tone: "connecting",
  };
  if (lifecycleStatus === "connected") {
    return { hidden: true, text: "", tone: "connecting" };
  }
  if (openingRoom) {
    return { hidden: false, text: "Opening room…", tone: "connecting" };
  }
  if (lifecycleStatus === "pending") {
    return {
      hidden: false,
      text: `Waiting for ${alias} to accept`,
      tone: "connecting",
    };
  }
  if (lifecycleStatus === "connect_failed") {
    if (lastConnectError === "unreachable") {
      return {
        hidden: false,
        text: "Secure link unavailable",
        tone: "offline",
      };
    }
    if (lastConnectError === "crypto_mismatch") {
      return {
        hidden: false,
        text: "Crypto mismatch — leave room and create a new one",
        tone: "error",
      };
    }
    return looking;
  }
  const terminal = TERMINAL_TEXT[lifecycleStatus];
  return terminal ? { hidden: false, text: terminal, tone: "error" } : looking;
}
