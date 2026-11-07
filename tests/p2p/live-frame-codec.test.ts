import { describe, expect, it } from "vitest";
import {
  decodeLiveFrame,
  encodeLiveFrame,
  LIVE_FRAME_HEADER_BYTES,
  LIVE_FRAME_MIN_BYTES,
  LIVE_FRAME_VERSION,
  liveFrameHeader,
} from "@/services/p2p/liveFrameCodec";

const TAG_BYTES = 16;

function ciphertextOf(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 31 + 5) & 0xff);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function frameBytes(
  version: number,
  counter: bigint,
  ciphertext: Uint8Array,
): Uint8Array {
  const bytes = new Uint8Array(1 + 8 + ciphertext.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, version);
  view.setBigUint64(1, counter, false);
  bytes.set(ciphertext, 9);
  return bytes;
}

describe("liveFrameCodec", () => {
  it("exposes the layout constants from the spec", () => {
    expect(LIVE_FRAME_VERSION).toBe(0x02);
    expect(LIVE_FRAME_HEADER_BYTES).toBe(1 + 8);
    expect(LIVE_FRAME_MIN_BYTES).toBe(1 + 8 + TAG_BYTES);
  });

  it("round-trips several counters including 0 and MAX_SAFE_INTEGER", () => {
    const ciphertext = ciphertextOf(TAG_BYTES + 40);
    for (const counter of [
      0,
      1,
      7,
      255,
      2 ** 32 + 3,
      Number.MAX_SAFE_INTEGER,
    ]) {
      const decoded = decodeLiveFrame(encodeLiveFrame(counter, ciphertext));
      expect(decoded).not.toBeNull();
      expect(decoded?.counter).toBe(counter);
      expect(Array.from(decoded?.ciphertext ?? [])).toEqual(
        Array.from(ciphertext),
      );
    }
  });

  it("writes 0x02 then the counter as u64 big-endian", () => {
    const counter = 7;
    const expected = frameBytes(0x02, BigInt(counter), new Uint8Array(0));
    expect(Array.from(liveFrameHeader(counter))).toEqual(Array.from(expected));

    const ciphertext = ciphertextOf(TAG_BYTES);
    const encoded = encodeLiveFrame(counter, ciphertext);
    expect(encoded).toBe(
      toBase64(frameBytes(0x02, BigInt(counter), ciphertext)),
    );
  });

  it("encodes large frames without overflowing the call stack", () => {
    const ciphertext = ciphertextOf(512 * 1024);
    const decoded = decodeLiveFrame(encodeLiveFrame(3, ciphertext));
    expect(decoded?.ciphertext.length).toBe(ciphertext.length);
  });

  it("rejects a wrong version byte", () => {
    const payload = toBase64(frameBytes(0x01, 7n, ciphertextOf(TAG_BYTES)));
    expect(decodeLiveFrame(payload)).toBeNull();
  });

  it("rejects input shorter than the minimum frame", () => {
    const short = frameBytes(0x02, 7n, ciphertextOf(TAG_BYTES - 1));
    expect(decodeLiveFrame(toBase64(short))).toBeNull();
    const minimal = frameBytes(0x02, 7n, ciphertextOf(TAG_BYTES));
    expect(decodeLiveFrame(toBase64(minimal))?.counter).toBe(7);
  });

  it("rejects a counter above MAX_SAFE_INTEGER", () => {
    const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const highBits = frameBytes(0x02, 1n << 63n, ciphertextOf(TAG_BYTES));
    const justOver = frameBytes(0x02, unsafe, ciphertextOf(TAG_BYTES));
    expect(decodeLiveFrame(toBase64(highBits))).toBeNull();
    expect(decodeLiveFrame(toBase64(justOver))).toBeNull();
  });

  it("returns null on invalid base64", () => {
    expect(() => decodeLiveFrame("not base64 !!!")).not.toThrow();
    expect(decodeLiveFrame("not base64 !!!")).toBeNull();
  });

  it("throws on counters that are not non-negative safe integers", () => {
    expect(() => liveFrameHeader(-1)).toThrow();
    expect(() => liveFrameHeader(1.5)).toThrow();
    expect(() => liveFrameHeader(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});
