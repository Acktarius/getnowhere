/** Settings tap → OS permission → toggle outcome for the notification toggles. */
import { isMobileAndroid } from "@/lib/mobile/gnhMobileBridgeTypes";
import {
  type NotificationReplyOptions,
  requestNotificationPermission,
} from "@/lib/mobile/nativeNotificationsBridge";
import { subscribeAll } from "@/lib/mobile/ntfyWakeBridge";
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";
import { registerPokeHandle } from "@/services/poke/pokeGatewayClient";

export type NotificationToggle = "notifications" | "wake" | "banner";

export type ToggleOnResult = { on: true } | { on: false; message?: string };

export const PERMISSION_SETTINGS_MESSAGE =
  "Notifications need to be turned on in Settings → Apps → Get NowHere → Notifications.";
export const NOTIFICATIONS_UNAVAILABLE_MESSAGE =
  "Notifications are not available in this build.";
export const WAKE_REGISTRATION_FAILED_MESSAGE =
  "Wake registration failed. Check your connection and try again.";

/** Privacy setting each toggle controls in `settingsStore`. */
export const NOTIFICATION_TOGGLE_PRIVACY_KEY = {
  notifications: "notificationsEnabled",
  wake: "pushWakeEnabled",
  banner: "notificationBannersEnabled",
} as const satisfies Record<NotificationToggle, string>;

export type ToggleFlowDeps = {
  request?: (
    request: { badge: boolean; alert: boolean; wantToken: boolean },
    options: NotificationReplyOptions,
  ) => Promise<NotificationPermissionReply>;
  isAndroid?: () => boolean;
  registerPokeHandle?: (platform: "apns", token: string) => Promise<string>;
  subscribeAll?: () => void;
  signal?: AbortSignal;
  /** Outcome of a reply that arrived after the timeout, evaluated with the same rules. */
  onLateResult?: (result: ToggleOnResult) => void;
};

/** Notifications needs authorized|provisional; Wake and Banner need authorized with alerts on. */
export function grantedFor(
  toggle: NotificationToggle,
  reply: NotificationPermissionReply,
): boolean {
  if (toggle === "notifications") {
    return reply.status === "authorized" || reply.status === "provisional";
  }
  return reply.status === "authorized" && reply.alertEnabled;
}

async function resolveReply(
  toggle: NotificationToggle,
  reply: NotificationPermissionReply,
  deps: Required<Omit<ToggleFlowDeps, "signal" | "onLateResult">>,
): Promise<ToggleOnResult> {
  if (reply.timedOut) return { on: false };
  if (reply.status === "unavailable") {
    return { on: false, message: NOTIFICATIONS_UNAVAILABLE_MESSAGE };
  }
  if (!grantedFor(toggle, reply)) {
    return { on: false, message: PERMISSION_SETTINGS_MESSAGE };
  }
  if (toggle !== "wake") return { on: true };
  if (deps.isAndroid()) {
    deps.subscribeAll();
    return { on: true };
  }
  if (!reply.apnsToken) {
    return { on: false, message: WAKE_REGISTRATION_FAILED_MESSAGE };
  }
  try {
    await deps.registerPokeHandle("apns", reply.apnsToken);
    return { on: true };
  } catch {
    return { on: false, message: WAKE_REGISTRATION_FAILED_MESSAGE };
  }
}

/**
 * Ask for the permission a toggle needs and report whether it may turn on.
 * iOS Wake also registers the APNs token with the poke gateway; Android Wake starts ntfy subscriptions.
 */
export async function runToggleOn(
  toggle: NotificationToggle,
  options: ToggleFlowDeps = {},
): Promise<ToggleOnResult> {
  const { signal, onLateResult } = options;
  const deps = {
    request: options.request ?? requestNotificationPermission,
    isAndroid: options.isAndroid ?? isMobileAndroid,
    registerPokeHandle: options.registerPokeHandle ?? registerPokeHandle,
    subscribeAll: options.subscribeAll ?? subscribeAll,
  };
  const alert = toggle !== "notifications";
  const wantToken = toggle === "wake" && !deps.isAndroid();
  const reply = await deps.request(
    { badge: true, alert, wantToken },
    {
      signal,
      onLateReply: (late) => {
        void resolveReply(toggle, late, deps).then((result) =>
          onLateResult?.(result),
        );
      },
    },
  );
  return resolveReply(toggle, reply, deps);
}
