// @vitest-environment node
import { createDaemonClient, type DaemonClient } from "conceal-wallet-sdk";
import { describe, expect, it, vi } from "vitest";
import { fetchWithBufferedBody } from "@/services/conceal/sync/daemon-fetch";
import { fetchSyncRange } from "@/services/conceal/sync/runtime";

const NODE_URL = "https://node.example/";

function stalledBody(): { response: Response; wasCancelled: () => boolean } {
  let cancelled = false;
  const stream = new ReadableStream({
    pull() {
      return new Promise(() => {});
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    wasCancelled: () => cancelled,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rawTx(height: number) {
  return {
    transaction: { vin: [], vout: [] },
    timestamp: 1,
    output_indexes: [],
    height,
    block_hash: "aa",
    hash: `h${height}`,
    fee: 0,
  };
}

describe("daemon body deadline", () => {
  it("rejects a body that stalls after headers and still returns the next full range", async () => {
    let calls = 0;
    const stall = stalledBody();
    const base: typeof fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return stall.response;
      return jsonResponse({
        status: "OK",
        transactions: [rawTx(1), rawTx(2), rawTx(3)],
      });
    });
    const client = createDaemonClient({
      nodeUrl: NODE_URL,
      timeoutMs: 40,
      fetch: (input, init) => fetchWithBufferedBody(base, input, init),
    });

    await expect(client.getWalletSyncData(1, 4, false)).rejects.toThrow(
      /timed out/,
    );
    await expect(client.getWalletSyncData(1, 4, false)).resolves.toEqual([
      expect.objectContaining({ height: 1 }),
      expect.objectContaining({ height: 2 }),
      expect.objectContaining({ height: 3 }),
    ]);
    expect(stall.wasCancelled()).toBe(true);
  });

  it("does not treat a stalled body as malformed JSON", async () => {
    const client = createDaemonClient({
      nodeUrl: NODE_URL,
      timeoutMs: 40,
      fetch: (input, init) =>
        fetchWithBufferedBody(async () => stalledBody().response, input, init),
    });
    const caught = await client.getHeight().catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toMatch(/timed out/);
    expect(message).not.toMatch(/not valid JSON/);
  });
});

describe("fetchSyncRange after a timeout", () => {
  it("throws instead of returning a short range, then a later fetch keeps every block", async () => {
    const stalled: DaemonClient = {
      getWalletSyncData: vi.fn(async () => {
        throw new Error(
          'Daemon request to "get_raw_transactions_by_heights" timed out after 30000ms.',
        );
      }),
    } as unknown as DaemonClient;
    await expect(fetchSyncRange(stalled, 1, 4, false)).rejects.toThrow(
      /timed out/,
    );

    const recovered: DaemonClient = {
      getWalletSyncData: vi.fn(async () => [
        { height: 1 },
        { height: 2 },
        { height: 3 },
      ]),
    } as unknown as DaemonClient;
    const txs = await fetchSyncRange(recovered, 1, 4, false);
    expect(txs.map((tx) => tx.height)).toEqual([1, 2, 3]);
  });
});
