/** Route gnh-ntfy-wake WebView commands to GnhNtfyWakeModule. */
import { NativeModules, Platform } from "react-native";

type NtfyWakeMessage = {
  channel?: string;
  direction?: string;
  action?: string;
  roomId?: string;
  topic?: string;
  token?: string;
};

export function parseNtfyWakeMessage(raw: string): NtfyWakeMessage | null {
  try {
    const msg = JSON.parse(raw) as NtfyWakeMessage;
    if (msg.channel !== "gnh-ntfy-wake" || msg.direction !== "command")
      return null;
    if (typeof msg.action !== "string") return null;
    return msg;
  } catch {
    return null;
  }
}

export function handleNtfyWakeWebViewMessage(raw: string): boolean {
  if (Platform.OS !== "android") return false;
  const msg = parseNtfyWakeMessage(raw);
  if (!msg) return false;
  const module = NativeModules.GnhNtfyWake as
    | {
        subscribe: (roomId: string, topic: string, token: string) => void;
        unsubscribe: (roomId: string) => void;
        unsubscribeAll: () => void;
      }
    | undefined;
  if (!module) return false;
  if (msg.action === "subscribe" && msg.topic) {
    module.subscribe(msg.roomId ?? "", msg.topic, msg.token ?? "");
    return true;
  }
  if (msg.action === "unsubscribeRoom") {
    module.unsubscribe(msg.roomId ?? "");
    return true;
  }
  if (msg.action === "unsubscribeAll") {
    module.unsubscribeAll();
    return true;
  }
  return true;
}
