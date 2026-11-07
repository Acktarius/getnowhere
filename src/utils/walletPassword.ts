/** Wallet password policy. @see docs/features/lite-wallet.md */
export const MIN_PASSWORD_LENGTH = 13;
export const MAX_PASSWORD_UTF8_BYTES = 1024;

export const WALLET_PASSWORD_HINTS = [
  {
    id: "length",
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (password: string) => password.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: "mixed",
    label: "Upper and lower case letters",
    test: (password: string) =>
      /[A-Z]/.test(password) && /[a-z]/.test(password),
  },
  {
    id: "letter",
    label: "At least one letter",
    test: (password: string) => /[A-Za-z]/.test(password),
  },
  {
    id: "digit",
    label: "At least one digit",
    test: (password: string) => /\d/.test(password),
  },
  {
    id: "symbol",
    label: "At least one symbol",
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const;

export function walletPasswordStrength(password: string): number {
  return WALLET_PASSWORD_HINTS.filter((hint) => hint.test(password)).length;
}

/** Whether a password is strong enough to encrypt the wallet. */
export function walletPasswordIsAcceptable(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    new TextEncoder().encode(password).length <= MAX_PASSWORD_UTF8_BYTES &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function describePasswordFailure(password: string): string | null {
  if (password.length === 0) return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_UTF8_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes.`;
  }
  if (!walletPasswordIsAcceptable(password)) {
    return "Password must include uppercase, lowercase, digit, and symbol characters.";
  }
  return null;
}
