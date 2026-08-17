import { Fingerprint, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { BrandMark } from "@/components/Brand";
import { getAppAccessState } from "@/lib/mobile/AppAccessController";
import { useAuthStore } from "@/state/authStore";

/** Wait until the WebView document is visible (resume from background). */
function waitForDocumentVisible(): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/** Mobile app-access gate — biometric retry only. */
export function AppLockScreen() {
  const unlockViaBiometric = useAuthStore((s) => s.unlockViaBiometric);
  const error = useAuthStore((s) => s.error);
  const busy = useAuthStore((s) => s.busy);

  useEffect(() => {
    let cancelled = false;
    const reason = getAppAccessState().reason;
    const resumeFromBackground =
      reason === "background" || reason === "screenOff";

    void (async () => {
      if (resumeFromBackground) {
        await waitForDocumentVisible();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!cancelled) await unlockViaBiometric();
    })();

    return () => {
      cancelled = true;
    };
  }, [unlockViaBiometric]);

  return (
    <div
      className="screen"
      style={{ background: "var(--bg)", position: "relative", zIndex: 10_000 }}
    >
      <div
        className="screen-scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: "40px 24px",
          gap: 24,
        }}
      >
        <div
          className="stack stack--gap-3 fade-in-up"
          style={{ alignItems: "center", width: "100%" }}
        >
          <BrandMark size={64} />
          <div className="eyebrow">App lock</div>
          <p
            className="muted center"
            style={{ fontSize: 14, maxWidth: 280, lineHeight: 1.5 }}
          >
            Confirm it is you before using Get NowHere on this device.
          </p>
        </div>
        <div
          className="stack stack--gap-3 fade-in-up"
          style={{ width: "100%", maxWidth: 280 }}
        >
          {error && <div className="field__error center">{error}</div>}
          <button
            type="button"
            className="btn btn--block btn--primary"
            disabled={busy}
            onClick={() => void unlockViaBiometric()}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="spin" /> Unlocking…
              </>
            ) : (
              <>
                <Fingerprint size={16} /> Require biometrics
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
