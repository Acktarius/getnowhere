/**
 * Route gnh-biometric and gnh-secure-prefs WebView messages to native module.
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */
import {
  invokeBiometricCommand,
  securePrefsGet,
  securePrefsRemove,
  securePrefsSet,
} from "./gnhSecurityNative";

export type SecurityWebViewResolve = (
  response: Record<string, unknown>,
) => void;

type IncomingMessage = {
  channel?: string;
  direction?: string;
  requestId?: string;
  lockGeneration?: number;
  action?: string;
  purpose?: string;
  key?: string;
  value?: string;
  walletId?: string;
  password?: string;
  credentialId?: string;
  passcode?: string;
};

function buildResponse(
  msg: IncomingMessage,
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    channel: msg.channel,
    direction: "response",
    requestId: msg.requestId,
    lockGeneration: msg.lockGeneration ?? 0,
    ...body,
  };
}

/** Returns true when the message was handled. */
export function handleSecurityWebViewMessage(
  raw: string,
  resolve: SecurityWebViewResolve,
): boolean {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw) as IncomingMessage;
  } catch {
    return false;
  }
  if (msg.direction !== "command" || !msg.requestId) return false;

  if (msg.channel === "gnh-biometric") {
    void (async () => {
      const result = await invokeBiometricCommand({
        action: msg.action,
        purpose: msg.purpose,
        walletId: msg.walletId,
        password: msg.password,
        credentialId: msg.credentialId,
        passcode: msg.passcode,
      });
      resolve(buildResponse(msg, result));
    })();
    return true;
  }

  if (msg.channel === "gnh-secure-prefs") {
    void (async () => {
      try {
        if (msg.action === "get" && msg.key) {
          const value = await securePrefsGet(msg.key);
          resolve(buildResponse(msg, { value }));
          return;
        }
        if (msg.action === "set" && msg.key && msg.value !== undefined) {
          await securePrefsSet(msg.key, msg.value);
          resolve(buildResponse(msg, { ok: true }));
          return;
        }
        if (msg.action === "remove" && msg.key) {
          await securePrefsRemove(msg.key);
          resolve(buildResponse(msg, { ok: true }));
          return;
        }
        resolve(buildResponse(msg, { error: "failed" }));
      } catch {
        resolve(buildResponse(msg, { error: "failed" }));
      }
    })();
    return true;
  }

  return false;
}

export function buildSecurityResolveScript(
  response: Record<string, unknown>,
): string {
  return `(function(){try{window.gnhMobile&&window.gnhMobile._resolveSecurity&&window.gnhMobile._resolveSecurity(${JSON.stringify(response)});}catch(e){}})();true;`;
}
