/** Generates a cryptographically random 14-char base64url room-scoped pokeId. */
export function generatePokeId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
