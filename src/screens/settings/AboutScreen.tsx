import { BrandMark, Wordmark } from "@/components/Brand";
import { BackLink, TopBar } from "@/components/TopBar";
import { version } from "../../../package.json";

export function AboutScreen() {
  return (
    <div className="screen">
      <TopBar title="About" leading={<BackLink to="/settings" />} bordered />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "24px 16px 40px" }}
      >
        <div className="center stack stack--gap-3 fade-in-up">
          <BrandMark size={64} />
          <Wordmark large />
          <span className="faint" style={{ fontSize: 12 }}>
            v{version} · getnowhere.im
          </span>
        </div>

        <div className="card fade-in-up">
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            Get NowHere is a privacy-first messenger that pairs a lightweight
            Conceal wallet with anonymous peer-to-peer chat. Two people
            establish a private relationship using Conceal wallet identities and
            exchanged payment IDs, then escalate into an encrypted, no-server
            conversation.
          </p>
        </div>

        <div className="card stack stack--gap-3 fade-in-up">
          <div className="card__title">Two layers, one app</div>
          <Layer
            title="On-chain (Conceal)"
            body="Used for wallet presence, relationship bootstrap, and smart-message invite delivery. Slow, durable, identity-light."
          />
          <Layer
            title="Off-chain (P2P room)"
            body="Used for fast encrypted chat. No central message store. Keet/Holepunch-style direct messaging is the target architecture."
          />
        </div>

        <div className="card stack stack--gap-2 fade-in-up">
          <div className="card__title">Status</div>
          <StatusRow
            label="Conceal wallet engine"
            value="Mock adapter · integration-ready"
          />
          <StatusRow
            label="Smart-message invites"
            value="Mock adapter · pluggable"
          />
          <StatusRow
            label="P2P chat transport"
            value="Mock transport · Holepunch boundary defined"
          />
        </div>

        <div className="card fade-in-up">
          <div className="card__title">Principles</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13.5,
              lineHeight: 1.7,
              color: "var(--text-muted)",
            }}
          >
            <li>Conceal wallet identity is the relationship anchor.</li>
            <li>No phone numbers, emails, or usernames as core identity.</li>
            <li>Least disclosure by default in the UI.</li>
            <li>
              On-chain bootstrap and off-chain chat stay clearly separated.
            </li>
          </ul>
        </div>

        <p className="center faint" style={{ fontSize: 11.5 }}>
          Early prototype. Not for production use with real funds.
        </p>
      </div>
    </div>
  );
}

function Layer({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {title}
      </div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-flex row-flex--between" style={{ gap: 12 }}>
      <span style={{ fontSize: 13.5 }}>{label}</span>
      <span className="faint" style={{ fontSize: 12, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
