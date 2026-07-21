import { Loader2 } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/Brand";
import { SecureInput } from "@/components/SecureInput";
import { useAuthStore } from "@/state/authStore";

export function UnlockScreen() {
  const verify = useAuthStore((s) => s.verify);
  const error = useAuthStore((s) => s.error);
  const busy = useAuthStore((s) => s.busy);
  const [code, setCode] = useState("");

  async function submit() {
    await verify(code);
    setCode("");
  }

  return (
    <div className="screen" style={{ background: "var(--bg)" }}>
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
        <div className="center stack stack--gap-3 fade-in-up">
          <BrandMark size={64} />
          <div className="eyebrow">Enter passcode to unlock</div>
        </div>
        <div
          className="stack stack--gap-3 fade-in-up"
          style={{ width: "100%", maxWidth: 280 }}
        >
          <SecureInput
            value={code}
            onChange={setCode}
            placeholder="Passcode"
            inputMode="numeric"
            revealable
            autoFocus
            maxLength={16}
          />
          {error && <div className="field__error center">{error}</div>}
          <button
            className="btn btn--block btn--primary"
            disabled={busy || code.length < 1}
            onClick={submit}
          >
            {busy ? (
              <>
                <Loader2 size={16} className="spin" /> Unlocking…
              </>
            ) : (
              "Unlock"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
