import { useSyncExternalStore } from "react";
import {
  isAppAccessLocked,
  subscribeAppAccessLock,
} from "@/lib/mobile/AppAccessController";

/** React subscription to module-level app-access lock (mobile idle/background gate). */
export function useAppAccessLocked(): boolean {
  return useSyncExternalStore(
    subscribeAppAccessLock,
    isAppAccessLocked,
    () => false,
  );
}
