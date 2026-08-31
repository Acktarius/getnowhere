import { useSyncExternalStore } from "react";
import {
  isAppInBackground,
  onAppAccessLifecycle,
} from "@/lib/mobile/AppAccessController";

/** Subscribe to foreground/background via AppAccessController lifecycle. */
export function useAppInBackground(): boolean {
  return useSyncExternalStore(
    (onChange) => onAppAccessLifecycle(() => onChange()),
    isAppInBackground,
    () => false,
  );
}
