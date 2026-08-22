/** Page-slice helpers for WalletScreen transaction history. @see docs/features/lite-wallet.md */

export const PAGE_SIZE = 25;

/** Total number of pages for `n` transactions. Always at least 1. */
export function totalPages(n: number): number {
  if (n <= 0) return 1;
  return Math.ceil(n / PAGE_SIZE);
}

/**
 * Clamp `page` to [1, totalPages(totalCount)].
 * Returns 1 for empty lists.
 */
export function clampPage(page: number, totalCount: number): number {
  const max = totalPages(totalCount);
  return Math.min(Math.max(1, page), max);
}

/**
 * Return the slice of `txs` for the given 1-based `page`.
 * Order is preserved (newest-first as stored).
 */
export function sliceWalletHistoryPage<T>(txs: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE;
  return txs.slice(start, start + PAGE_SIZE);
}
