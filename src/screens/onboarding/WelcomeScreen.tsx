import { KeyRound, Radio, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark, Wordmark } from "@/components/Brand";

export function WelcomeScreen() {
  const navigate = useNavigate();
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
            <button
              className="btn btn--block btn--primary"
              onClick={() => navigate("/onboarding/create")}
            >
              Create wallet
            </button>
            <Link
              to="/onboarding/restore"
              className="btn btn--block btn--secondary"
            >
              Restore from seed
            </Link>
            <Link
              to="/onboarding/import"
              className="btn btn--block btn--ghost"
              style={{ fontSize: 13 }}
            >
              Import from keys or backup file
            </Link>
          </div>
          <p className="center faint" style={{ fontSize: 11.5, paddingTop: 4 }}>
            No phone numbers. No emails. No usernames.
          </p>
        </div>
      </div>
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
