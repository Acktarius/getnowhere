import { useAppAccessLocked } from "@/hooks/useAppAccessLocked";
import { useAppInBackground } from "@/hooks/useAppInBackground";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { useSettingsStore } from "@/state/settingsStore";

/**
 * Obscures sensitive UI when backgrounded with blurInAppSwitcher on.
 * Native shell also covers the WebView for iOS app-switcher snapshots.
 * @see docs/features/app-access-and-data-unlock.md
 */
export function AppSwitcherBlurOverlay() {
  const enabled = useSettingsStore((s) => s.privacy.blurInAppSwitcher);
  const background = useAppInBackground();
  const appAccessLocked = useAppAccessLocked();
  if (!isMobileHost() || !enabled || !background || appAccessLocked) {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 8990,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        background: "rgba(10, 11, 15, 0.55)",
        pointerEvents: "none",
      }}
    />
  );
}
