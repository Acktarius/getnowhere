/** User-gesture flow: Wake contact opt-in (permission + wake registration) or opt-out. */
import {
  runToggleOn,
  type ToggleFlowDeps,
  type ToggleOnResult,
} from "@/services/notifications/notificationToggleFlow";
import { useSettingsStore } from "@/state/settingsStore";

/** Persists Wake only once permission and registration succeed; a late success persists too. */
export async function applyPushWakeEnabled(
  on: boolean,
  options: ToggleFlowDeps = {},
): Promise<ToggleOnResult> {
  const { setPrivacy } = useSettingsStore.getState();
  if (!on) {
    // settingsStore side-effect handles opt-out cleanup (Android ntfy unsubscribe / iOS deletePokeHandle).
    setPrivacy({ pushWakeEnabled: false });
    return { on: false };
  }
  const result = await runToggleOn("wake", {
    ...options,
    onLateResult: (late) => {
      if (late.on) setPrivacy({ pushWakeEnabled: true });
      options.onLateResult?.(late);
    },
  });
  if (result.on) setPrivacy({ pushWakeEnabled: true });
  return result;
}
