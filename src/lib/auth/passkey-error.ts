/** Wallet biometric unlock errors (parity with conceal-next-wallet PasskeyError). */
export class PasskeyError extends Error {
  readonly code:
    | "cancelled"
    | "unsupported"
    | "failed"
    | "already-enrolled"
    | "invalidated";

  constructor(code: PasskeyError["code"], message: string) {
    super(message);
    this.name = "PasskeyError";
    this.code = code;
  }
}
