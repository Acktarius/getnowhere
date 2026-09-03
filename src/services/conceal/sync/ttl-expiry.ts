/** True when a mempool TTL unix second is in the past. */
export function isTtlExpired(
  ttlExpiresAt: number | undefined,
  nowUnix: number,
): boolean {
  return (
    typeof ttlExpiresAt === "number" &&
    ttlExpiresAt > 0 &&
    nowUnix >= ttlExpiresAt
  );
}
