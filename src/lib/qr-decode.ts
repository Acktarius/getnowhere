import jsQR from "jsqr";

/** Decode a QR code from raw RGBA pixel data. Returns the payload, or null. */
export function decodeQrFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  const result = jsQR(data, width, height, {
    inversionAttempts: "attemptBoth",
  });
  return result?.data ?? null;
}
