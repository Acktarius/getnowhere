/** L2 live frame codec: `base64(0x02 || counter u64 BE || ciphertext+tag)`. @see docs/security/p2pchatprotocol.md */

/** Version byte of the current live frame layout. */
export const LIVE_FRAME_VERSION = 0x02;
/** Header length: version (1) + counter (8). */
export const LIVE_FRAME_HEADER_BYTES = 9;
/** Smallest valid frame: header + 16-byte Poly1305 tag. */
export const LIVE_FRAME_MIN_BYTES = 25;

/** Decoded live frame. */
export interface DecodedLiveFrame {
  counter: number;
  ciphertext: Uint8Array;
}

/** 9-byte header `0x02 || counter`; throws unless counter is a non-negative safe integer. */
export function liveFrameHeader(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError(
      "live frame counter must be a non-negative safe integer",
    );
  }
  const header = new Uint8Array(LIVE_FRAME_HEADER_BYTES);
  const view = new DataView(header.buffer);
  view.setUint8(0, LIVE_FRAME_VERSION);
  view.setBigUint64(1, BigInt(counter), false);
  return header;
}

/** Base64 of `liveFrameHeader(counter) || ciphertext`. */
export function encodeLiveFrame(
  counter: number,
  ciphertext: Uint8Array,
): string {
  const frame = new Uint8Array(LIVE_FRAME_HEADER_BYTES + ciphertext.length);
  frame.set(liveFrameHeader(counter), 0);
  frame.set(ciphertext, LIVE_FRAME_HEADER_BYTES);
  return bytesToBase64(frame);
}

/** Parses a live frame payload; returns null on any malformed input and never throws. */
export function decodeLiveFrame(payloadB64: string): DecodedLiveFrame | null {
  const bytes = base64ToBytes(payloadB64);
  if (!bytes || bytes.length < LIVE_FRAME_MIN_BYTES) return null;
  if (bytes[0] !== LIVE_FRAME_VERSION) return null;
  const counter = new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(
    1,
    false,
  );
  if (counter > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    counter: Number(counter),
    ciphertext: bytes.slice(LIVE_FRAME_HEADER_BYTES),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array | null {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
