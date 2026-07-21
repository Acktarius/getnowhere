/**
 * Multi-source parallel block fetch (deep-sync speedup, Phase 2).
 *
 * Distributes a large historical block range across SEVERAL daemon nodes so the download runs in
 * parallel instead of one-node-at-a-time, while keeping the FOLD strictly sequential and in block
 * order (the wallet state machine must apply blocks ascending). The premise — that independent
 * healthy nodes return byte-identical data for the same buried range, so concatenating sub-ranges
 * fetched from different nodes equals a single contiguous fetch — was validated against live
 * testnet nodes (zero gaps/dups, identical ordered (height, hash) sequences).
 *
 * This module is PURE and ENGINE-FREE: it is generic over the batch payload `T` and takes the
 * per-node fetch as a callback, so it unit-tests without the network or the SDK, and mock mode
 * never pulls the engine through it.
 *
 * SAFETY (fund-correctness): a node that is BEHIND a requested range would silently return a short
 * result, and with miner-txs off an empty batch is indistinguishable from "no owned txs" — so a
 * behind-node batch could drop blocks undetectably. The driver therefore assigns a batch ONLY to a
 * source whose reported `height` covers the batch's upper bound, and ALWAYS keeps the home node
 * (`sources[0]`) as the failover-of-last-resort. The caller is responsible for bounding the range
 * to the home node's height and keeping the volatile chain TIP on the home node (reorg safety).
 */

/** One block source: a node's reported tip + a fetch for a HALF-OPEN block range `[start, end)`. */
export interface FetchSource<T> {
  /** Stable label for logging/diagnostics (e.g. the node URL). */
  readonly label: string;
  /** The node's reported tip height. A batch is only assigned to a source whose height covers it. */
  readonly height: number;
  /** Fetch the HALF-OPEN block range `[start, end)`. May reject — failover handles it. */
  fetch(start: number, end: number): Promise<T[]>;
}

export interface MultiSourceOptions<T> {
  /** Inclusive start of the range to fetch. */
  readonly start: number;
  /** Exclusive end of the range. */
  readonly end: number;
  /** Blocks per batch (>0). */
  readonly batchSize: number;
  /**
   * Ranked sources, FASTEST FIRST. `sources[0]` is treated as the home / failover-of-last-resort
   * and MUST cover the whole range (`sources[0].height >= end`). Must be non-empty.
   */
  readonly sources: readonly FetchSource<T>[];
  /**
   * Invoked with each batch's items in STRICT ASCENDING block order — fold here, sequentially.
   * Awaited before the next batch is delivered, so two `onBatch` calls never overlap even though
   * the fetches run in parallel.
   */
  onBatch(
    items: T[],
    batchStart: number,
    batchEnd: number,
  ): Promise<void> | void;
}

/** A half-open batch range `[start, end)`. */
export interface BatchRange {
  readonly start: number;
  readonly end: number;
}

/** Split `[start, end)` into contiguous half-open batches of at most `batchSize` blocks. */
export function planBatches(
  start: number,
  end: number,
  batchSize: number,
): BatchRange[] {
  if (!(batchSize > 0)) throw new Error("batchSize must be > 0");
  const batches: BatchRange[] = [];
  for (let s = start; s < end; s += batchSize) {
    batches.push({ start: s, end: Math.min(s + batchSize, end) });
  }
  return batches;
}

/**
 * The ordered list of sources to try for a batch: every source whose height covers the batch,
 * ROTATED by the batch index so consecutive batches prefer different nodes (even load spreading).
 * The home node (`sources[0]`) is always guaranteed PRESENT as a failover candidate — it is the
 * authoritative node that covers the whole range — but it is NOT forced last, so it also takes its
 * fair share of batches as a primary (forcing it last would starve it of work when it is one of
 * only two nodes). Never empty.
 */
export function sourcesForBatch<T>(
  batch: BatchRange,
  index: number,
  sources: readonly FetchSource<T>[],
): FetchSource<T>[] {
  const home = sources[0];
  const eligible = sources.filter((s) => s.height >= batch.end);
  // Only the home node is trusted to cover everything; if nothing else qualifies, use it alone.
  const pool = eligible.length > 0 ? eligible : [home];
  // Round-robin the primary by batch index for load spreading.
  const rotated = pool.map((_, i) => pool[(i + index) % pool.length]);
  // Guarantee the home node is reachable as a fallback even if it was filtered out of `pool`.
  if (!rotated.includes(home)) rotated.push(home);
  return rotated;
}

/** Fetch a batch, trying each candidate source in order; reject only if ALL candidates fail. */
async function fetchBatchWithFailover<T>(
  batch: BatchRange,
  candidates: readonly FetchSource<T>[],
): Promise<T[]> {
  let lastError: unknown;
  for (const source of candidates) {
    try {
      return await source.fetch(batch.start, batch.end);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`All sources failed for blocks [${batch.start}, ${batch.end})`);
}

/**
 * Fetch `[start, end)` across `sources` in parallel (one in-flight request per source) and deliver
 * the batches to `onBatch` in STRICT ASCENDING order. Folding (in `onBatch`) overlaps the next
 * batches' downloads, so wall-clock approaches `max(fold, fetch / sources.length)`. Rejects without
 * delivering a gap if a batch fails on every eligible source (the caller's sync then retries from
 * its last scanned height — blocks are never silently skipped).
 */
export async function fetchRangeMultiSource<T>(
  opts: MultiSourceOptions<T>,
): Promise<void> {
  const { start, end, batchSize, sources, onBatch } = opts;
  if (sources.length === 0)
    throw new Error("fetchRangeMultiSource requires at least one source");
  if (start >= end) return;

  const batches = planBatches(start, end, batchSize);
  // Pre-resolve each batch's candidate source list, then keep a sliding window of in-flight
  // fetches (one per source). `void .catch` silences a rejection on a batch we may never await
  // (an earlier batch failed and aborted the loop) so it can't surface as an unhandledrejection.
  const inFlight: Array<Promise<T[]> | null> = new Array(batches.length).fill(
    null,
  );
  const startFetch = (i: number): void => {
    const p = fetchBatchWithFailover(
      batches[i],
      sourcesForBatch(batches[i], i, sources),
    );
    void p.catch(() => {});
    inFlight[i] = p;
  };

  const window = Math.min(sources.length, batches.length);
  let nextToStart = 0;
  for (; nextToStart < window; nextToStart++) startFetch(nextToStart);

  for (let i = 0; i < batches.length; i++) {
    const pending = inFlight[i];
    // pending is always set: indices [0,window) primed above; each iteration starts index
    // i+window before it's awaited. The non-null assertion documents that invariant.
    const items = await (pending as Promise<T[]>);
    // Keep the window full: start the next not-yet-started fetch before folding this batch, so it
    // downloads during the (sequential) fold.
    if (nextToStart < batches.length) startFetch(nextToStart++);
    await onBatch(items, batches[i].start, batches[i].end);
  }
}
