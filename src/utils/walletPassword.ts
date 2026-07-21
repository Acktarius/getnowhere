// Wallet password validation — aligned to conceal-next-wallet's rules.
// Source: github.com/ConcealNetwork/conceal-next-wallet
//   components/wallet/password-strength-bars.tsx
//
// A wallet-encryption password must clear:
//   - a hard length floor (MIN_PASSWORD_LENGTH), AND
//   - a variety minimum (MIN_PASSWORD_STRENGTH) — number of satisfied hints.
// Score alone is insufficient (a 3-char "Ab1" scores 3), so we also require
// the length floor.

export const MIN_PASSWORD_LENGTH = 8;
export const MIN_PASSWORD_STRENGTH = 3;

export const WALLET_PASSWORD_HINTS = [
  {
    id: "length",
    label: "More than 15 characters",
    test: (password: string) => password.length > 15,
  },
  {
    id: "mixed",
    label: "Upper and lower case letters",
    test: (password: string) => /[A-Z]/.test(password) && /[a-z]/.test(password),
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
    walletPasswordStrength(password) >= MIN_PASSWORD_STRENGTH
  );
}

export function describePasswordFailure(password: string): string | null {
  if (password.length === 0) return "Password is required.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const strength = walletPasswordStrength(password);
  if (strength < MIN_PASSWORD_STRENGTH) {
    return "Password is too weak. Add a mix of upper/lower case, digits, and symbols.";
  }
  return null;
}
