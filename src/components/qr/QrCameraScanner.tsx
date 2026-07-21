/**
 * Live camera QR scanner — rear camera + jsQR, same idea as conceal-next-wallet.
 * No Cordova bridge; web / WebView getUserMedia only.
 */
import { useEffect, useRef, useState } from "react";
import { decodeQrFromImageData } from "@/lib/qr-decode";

async function openCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video: true });
  }
}

export function QrCameraScanner({
  onDecode,
  onCancel,
}: {
  onDecode: (payload: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "This browser can't access the camera. Paste the QR payload instead.",
        );
        return;
      }
      try {
        stream = await openCameraStream();
        const video = videoRef.current;
        if (cancelled || !video) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
        if (cancelled) return;

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const tick = () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (
            ctx &&
            v &&
            v.readyState >= v.HAVE_CURRENT_DATA &&
            v.videoWidth > 0
          ) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const payload = decodeQrFromImageData(
              frame.data,
              frame.width,
              frame.height,
            );
            if (payload) {
              onDecodeRef.current(payload);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!cancelled) {
          const detail =
            err instanceof Error && err.message ? ` (${err.message})` : "";
          setError(
            `Couldn't access the camera${detail}. Allow camera permission or paste the payload.`,
          );
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="stack stack--gap-3">
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : (
        <div
          style={{
            overflow: "hidden",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border)",
            background: "#000",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{
              width: "100%",
              aspectRatio: "1",
              objectFit: "cover",
              display: "block",
            }}
          />
        </div>
      )}
      <button
        type="button"
        className="btn btn--block btn--secondary"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
