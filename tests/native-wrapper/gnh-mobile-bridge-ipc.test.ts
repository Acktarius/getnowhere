import { describe, expect, it, vi } from "vitest";
import { MAX_NDJSON_LINE_BYTES } from "../../native-wrapper/src/bridgeLimits";
import {
  createLineReader,
  NdjsonLineTooLongError,
} from "../../native-wrapper/src/createLineReader";
import { IpcLineProcessor } from "../../native-wrapper/src/ipcLineProcessor";

describe("createLineReader", () => {
  it("throws on partial line over max and clears buffer for next valid line", () => {
    const maxBytes = 32;
    const reader = createLineReader(maxBytes);
    expect(() => reader.push("x".repeat(maxBytes + 1))).toThrow(
      NdjsonLineTooLongError,
    );
    const msgs = reader.push('{"type":"ok"}\n');
    expect(msgs).toEqual([{ type: "ok" }]);
  });

  it("parses fragmented lines under the cap", () => {
    const reader = createLineReader(64);
    expect(reader.push('{"type":"')).toEqual([]);
    expect(reader.push('hello"}\n')).toEqual([{ type: "hello" }]);
  });
});

describe("IpcLineProcessor (GnhMobileBridge.onIpcData path)", () => {
  const enc = new TextEncoder();

  it("calls onOverflow on partial mega-line and stops accepting IPC", () => {
    const onOverflow = vi.fn();
    const events: unknown[] = [];
    const proc = new IpcLineProcessor(
      (msg) => events.push(msg),
      onOverflow,
    );

    proc.push(enc.encode("x".repeat(MAX_NDJSON_LINE_BYTES + 1)));
    proc.push(enc.encode('{"type":"late"}\n'));

    expect(onOverflow).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
    expect(proc.isAccepting).toBe(false);
  });

  it("dispatches valid events under the cap", () => {
    const onOverflow = vi.fn();
    const events: unknown[] = [];
    const proc = new IpcLineProcessor(
      (msg) => events.push(msg),
      onOverflow,
    );

    proc.push(enc.encode('{"type":"ready"}\n'));

    expect(events).toEqual([{ type: "ready" }]);
    expect(onOverflow).not.toHaveBeenCalled();
  });

  it("handles fragmented valid lines across chunks", () => {
    const events: unknown[] = [];
    const proc = new IpcLineProcessor((msg) => events.push(msg), vi.fn());

    proc.push(enc.encode('{"type":"'));
    proc.push(enc.encode('frag"}\n'));

    expect(events).toEqual([{ type: "frag" }]);
  });
});
