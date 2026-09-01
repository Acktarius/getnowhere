// Small utility helpers used across the app.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function shortAddress(addr: string, head = 8, tail = 6): string {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Discovery topic ref for diagnostics: 8 + `......` + 8 on 64-char hex refs. */
export function shortTopicRef(topicRef: string): string {
  const head = 8;
  const tail = 8;
  if (!topicRef || topicRef.length <= head + tail) return topicRef;
  return `${topicRef.slice(0, head)}......${topicRef.slice(-tail)}`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  const mo = Math.floor(day / 30);
  return `${mo}mo`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Unix seconds → locale date and time (room TTL diagnostics). */
export function formatUnixDateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCCX(amount: number, dp = 4): string {
  const s = amount.toFixed(dp);
  // strip trailing zeros but keep at least 2 dp
  const [whole, frac] = s.split(".");
  const trimmed = frac.replace(/0+$/, "").padStart(2, "0").slice(0, dp);
  return `${whole}.${trimmed}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function maskValue(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "•".repeat(value.length);
  return `${value.slice(0, visible)}${"•".repeat(Math.min(12, value.length - visible))}`;
}

// Deterministic-ish mock CCX address generator. Real validation happens
// inside the wallet adapter.
const CCX_CHARSET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateMockCcxAddress(prefix = "ccx7"): string {
  let s = prefix;
  for (let i = 0; i < 95 - prefix.length; i++) {
    s += CCX_CHARSET[Math.floor(Math.random() * CCX_CHARSET.length)];
  }
  return s;
}

export function generatePaymentId(): string {
  let s = "";
  for (let i = 0; i < 64; i++) {
    s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  }
  return s;
}

export function generateSeedPhrase(wordCount = 25): string {
  // Mock BIP-39-style phrase for UX demonstration only. NEVER use for real keys.
  const words = [
    "orbit",
    "lantern",
    "cipher",
    "violet",
    "harbor",
    "silent",
    "ember",
    "ridge",
    "drift",
    "willow",
    "quartz",
    "meadow",
    "anchor",
    "velvet",
    "phoenix",
    "threshold",
    "basin",
    "marble",
    "echo",
    "frost",
    "tundra",
    "cobalt",
    "ridge",
    "lattice",
    "spiral",
    "manor",
    "pulse",
    "zephyr",
    "gravel",
    "nimbus",
    "amber",
    "verse",
    "cipher",
    "haven",
    "tide",
    "willow",
    "onyx",
    "dune",
    "sable",
    "fjord",
    "cinder",
    "moss",
    "glade",
    "rune",
    "kelp",
    "wisp",
    "cliff",
    "shade",
  ];
  const out: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    out.push(words[Math.floor(Math.random() * words.length)]);
  }
  return out.join(" ");
}

export function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
