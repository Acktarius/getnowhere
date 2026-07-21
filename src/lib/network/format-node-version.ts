/** Display daemon version from getinfo (e.g. "6.7.4" or "Conceal Core 6.9.2"). */
export function formatNodeVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return "—";
  const coreStripped = trimmed.replace(/^Conceal Core\s+/i, "");
  if (/^\d/.test(coreStripped)) return `v${coreStripped}`;
  return trimmed;
}
