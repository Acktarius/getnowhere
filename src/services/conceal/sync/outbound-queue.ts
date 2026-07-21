/**
 * Outbound queue stub — sends go direct; no durable retry queue in lite wallet.
 */
export type OutboundQueue = {
  drainOnce(): Promise<void>;
  list(): Promise<{ id: string; hash: string }[]>;
  remove(id: string): Promise<void>;
};

const EMPTY: OutboundQueue = {
  async drainOnce() {},
  async list() {
    return [];
  },
  async remove() {},
};

export function queueForRuntime(_rt: unknown): OutboundQueue {
  return EMPTY;
}
