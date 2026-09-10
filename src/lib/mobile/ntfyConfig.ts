/** Self-hosted ntfy base URL for peer-wake. */
export const NTFY_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_NTFY_BASE_URL) ||
  "https://ntfy.getnowhere.im";
