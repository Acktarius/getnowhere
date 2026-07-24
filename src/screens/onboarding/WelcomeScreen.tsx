import { KeyRound, Loader2, Radio, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/Brand";
import { SecureInput } from "@/components/SecureInput";
import { Sheet } from "@/components/Sheet";
import { markOnboarded } from "@/state/authStore";
import { useWalletStore } from "@/state/walletStore";

export function WelcomeScreen() {
  const navigate = useNavigate();
  const openStoredWallet = useWalletStore((s) => s.openStoredWallet);
  const hasStoredWallet = useWalletStore((s) => s.hasStoredWallet);
  const initializing = useWalletStore((s) => s.initializing);

  const [stored, setStored] = useState<boolean | null>(null);
  const [openSheet, setOpenSheet] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasStoredWallet().then((v) => {
      if (!cancelled) setStored(v);
    });
    return () => {
      cancelled = true;
    };
  }, [hasStoredWallet]);

  async function handleOpen() {
    setError(null);
    if (!password.trim()) {
      setError("Enter your wallet password.");
      return;
    }
    try {
      await openStoredWallet(password);
      markOnboarded();
      setOpenSheet(false);
      setPassword("");
      navigate("/contacts");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const showOpen = stored === true;

  return (
    <div className="screen" style={{ padding: 0 }}>
      <div
        className="screen-scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "100%",
          padding: "calc(env(safe-area-inset-top) + 24px) 24px 40px",
        }}
      >
        <div
          className="center stack stack--gap-6 fade-in-up"
          style={{ marginTop: "5vh", alignItems: "center" }}
        >
          <BrandMark size={84} />
          <div className="stack stack--gap-2">
            <Wordmark large />
            <p
              className="muted"
              style={{ fontSize: 14, maxWidth: 280, margin: "0 auto" }}
            >
              Private rendezvous. Conceal wallet identities meet encrypted
              peer-to-peer chat.
            </p>
          </div>
        </div>

        <div
          className="stack stack--gap-3 fade-in-up"
          style={{ marginTop: 24 }}
        >
          <div className="card card--pad-md">
            <div className="stack stack--gap-3">
              <FeatureRow
                icon={KeyRound}
                title="Conceal lite wallet"
                body="A private wallet identity anchors your trusted contacts."
              />
              <div className="card__divider" />
              <FeatureRow
                icon={ShieldCheck}
                title="Private relationships"
                body="Bootstrap contact trust with exchanged payment IDs."
              />
              <div className="card__divider" />
              <FeatureRow
                icon={Radio}
                title="Encrypted P2P chat"
                body="Move to a direct, no-server room once trust is set."
              />
            </div>
          </div>

          <div className="stack stack--gap-2">
            {stored === null ? (
              <button
                type="button"
                className="btn btn--block btn--primary"
                disabled
              >
                <Loader2 size={16} className="spin" /> Checking…
              </button>
            ) : showOpen ? (
              <>
                <button
                  type="button"
                  className="btn btn--block btn--primary"
                  onClick={() => {
                    setError(null);
                    setPassword("");
                    setOpenSheet(true);
                  }}
                >
                  Open wallet
                </button>
                <Link
                  to="/onboarding/create"
                  className="btn btn--block btn--ghost"
                  style={{ fontSize: 13 }}
                >
                  Create a new one →
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--block btn--primary"
                  onClick={() => navigate("/onboarding/create")}
                >
                  Create wallet
                </button>
                <Link
                  to="/onboarding/import"
                  className="btn btn--block btn--secondary"
                >
                  Restore from QR code
                </Link>
                <Link
                  to="/onboarding/import"
                  className="btn btn--block btn--ghost"
                  style={{ fontSize: 13 }}
                >
                  Import from seed, keys, or backup file
                </Link>
              </>
            )}
          </div>
          <p className="center faint" style={{ fontSize: 11.5, paddingTop: 4 }}>
            No phone numbers. No emails. No usernames.
          </p>
        </div>
      </div>

      <Sheet
        open={openSheet}
        title="Open wallet"
        onClose={() => {
          if (initializing) return;
          setOpenSheet(false);
          setPassword("");
          setError(null);
        }}
      >
        <div className="stack stack--gap-3">
          <p className="muted" style={{ fontSize: 13.5 }}>
            Enter the encryption password for the wallet stored on this device.
          </p>
          <SecureInput
            label="Wallet password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            revealable
            autoFocus
          />
          {error && <div className="field__error">{error}</div>}
          <button
            type="button"
            className="btn btn--block btn--primary"
            disabled={initializing || password.length < 1}
            onClick={() => void handleOpen()}
          >
            {initializing ? (
              <>
                <Loader2 size={16} className="spin" /> Opening…
              </>
            ) : (
              "Open"
            )}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
}) {
  return (
    <div className="row-flex" style={{ gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "var(--primary-soft)",
          color: "var(--primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} />
      </div>
      <div className="grow">
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div className="field__hint">{body}</div>
      </div>
    </div>
  );
}
