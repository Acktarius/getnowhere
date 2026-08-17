import { useAppAccessLocked } from "@/hooks/useAppAccessLocked";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

/** Blocks interaction when mobile app access is locked. */
export function AppAccessBlurOverlay() {
  const locked = useAppAccessLocked();
  if (!isMobileHost() || !locked) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        background: "rgba(10, 11, 15, 0.35)",
        pointerEvents: "none",
      }}
    />
  );
}
