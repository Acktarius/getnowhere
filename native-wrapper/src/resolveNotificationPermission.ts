/** Shell-owned ordering for notification permission replies. @see docs/features/local-background-notifications.md */

export type NotificationPermissionStatus =
  | "authorized"
  | "provisional"
  | "denied"
  | "notDetermined"
  | "unavailable";

export type NotificationPermissionResult = {
  status: NotificationPermissionStatus;
  alertEnabled: boolean;
  apnsToken?: string;
};

/** Subset of the GnhNotifications native module used for permissions (JSON string results). */
export type NotificationPermissionNative = {
  requestPermissions(badge: boolean, alert: boolean): Promise<string>;
  getPermissionStatus(): Promise<string>;
};

export type NotificationPermissionDeps = {
  platformOS: string;
  native: NotificationPermissionNative | undefined;
  /** `Platform.Version` on Android; ignored elsewhere. */
  androidApiLevel: number;
  /** `PermissionsAndroid.request(POST_NOTIFICATIONS)` result string. */
  requestAndroidPostNotifications: () => Promise<string>;
  /** Raw APNs device token (iOS); may throw. */
  getDevicePushToken: () => Promise<string>;
};

/** Android 13 (TIRAMISU) introduced the POST_NOTIFICATIONS runtime permission. */
const ANDROID_POST_NOTIFICATIONS_API = 33;

export type NotificationPermissionRequest = {
  badge: boolean;
  alert: boolean;
  wantToken: boolean;
};

const KNOWN_STATUSES: readonly NotificationPermissionStatus[] = [
  "authorized",
  "provisional",
  "denied",
  "notDetermined",
];

function unavailable(): NotificationPermissionResult {
  return { status: "unavailable", alertEnabled: false };
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toStatus(value: unknown): NotificationPermissionStatus {
  return KNOWN_STATUSES.find((s) => s === value) ?? "unavailable";
}

/** Current permission state without prompting; `unavailable` when native is missing or fails. */
export async function readNotificationPermissionStatus(
  deps: NotificationPermissionDeps,
): Promise<NotificationPermissionResult> {
  if (!deps.native) return unavailable();
  try {
    const parsed = parseJsonObject(await deps.native.getPermissionStatus());
    const status = toStatus(parsed?.status);
    if (status === "unavailable") return unavailable();
    return { status, alertEnabled: parsed?.alert === true };
  } catch {
    return unavailable();
  }
}

/**
 * Prompt for notification permission and resolve once the user's answer is known.
 * Never throws; native missing, a thrown call, or an unknown status → `unavailable`.
 */
export async function resolveNotificationPermission(
  deps: NotificationPermissionDeps,
  request: NotificationPermissionRequest,
): Promise<NotificationPermissionResult> {
  const native = deps.native;
  if (!native) return unavailable();
  try {
    const isAndroid = deps.platformOS === "android";
    const status = isAndroid
      ? await requestAndroid(deps, native, request)
      : await requestIos(native, request);
    if (status === "unavailable") return unavailable();
    const current = await readNotificationPermissionStatus(deps);
    const result: NotificationPermissionResult = {
      status,
      alertEnabled: current.alertEnabled,
    };
    if (!isAndroid && request.wantToken && isGranted(status)) {
      const apnsToken = await fetchTokenOrUndefined(deps);
      if (apnsToken) result.apnsToken = apnsToken;
    }
    return result;
  } catch {
    return unavailable();
  }
}

async function requestIos(
  native: NotificationPermissionNative,
  request: NotificationPermissionRequest,
): Promise<NotificationPermissionStatus> {
  const answer = parseJsonObject(
    await native.requestPermissions(request.badge, request.alert),
  );
  return toStatus(answer?.status);
}

/**
 * Kotlin `requestPermissions` launches its own prompt when not yet granted, which would
 * make a concurrent `PermissionsAndroid` request resolve early — so ask first, Kotlin after.
 */
async function requestAndroid(
  deps: NotificationPermissionDeps,
  native: NotificationPermissionNative,
  request: NotificationPermissionRequest,
): Promise<NotificationPermissionStatus> {
  if (deps.androidApiLevel < ANDROID_POST_NOTIFICATIONS_API) {
    await native.requestPermissions(request.badge, request.alert);
    return "authorized";
  }
  const answer = await deps.requestAndroidPostNotifications();
  if (answer !== "granted") return "denied";
  await native.requestPermissions(request.badge, request.alert).catch(() => {});
  return "authorized";
}

function isGranted(status: NotificationPermissionStatus): boolean {
  return status === "authorized" || status === "provisional";
}

async function fetchTokenOrUndefined(
  deps: NotificationPermissionDeps,
): Promise<string | undefined> {
  try {
    const token = await deps.getDevicePushToken();
    return typeof token === "string" && token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}
