import { ArrowLeftRight, Check, Link2, Radio, ShieldCheck } from "lucide-react";
import type { Contact } from "@/types/models";

type Props = { contact: Contact };

export function RelationshipStateCard({ contact }: Props) {
  const hasFrom = Boolean(contact.paymentIdFrom);
  const hasTo = Boolean(
    contact.paymentIdTo && contact.paymentIdTo.length >= 16,
  );
  const identityLinked = Boolean(contact.ccxAddress);
  const returnReceived = hasTo;
  const verified = hasFrom && hasTo;
  const p2pEligible = verified && contact.relationshipStatus === "established";

  const steps = [
    {
      label: "Identity linked",
      desc: "CCX address recorded",
      done: identityLinked,
      icon: Link2,
    },
    {
      label: "Return identifier received",
      desc: "Counterpart's paymentIdTo saved",
      done: returnReceived,
      icon: ArrowLeftRight,
    },
    {
      label: "Relationship verified",
      desc: "Both mappings present",
      done: verified,
      icon: ShieldCheck,
    },
    {
      label: "P2P eligible",
      desc: "Chat invite can be sent",
      done: p2pEligible,
      icon: Radio,
    },
  ];

  return (
    <div className="card">
      <div className="card__title">Relationship state</div>
      <div className="stack stack--gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={i}
              className="row-flex"
              style={{
                gap: 12,
                padding: "10px 0",
                opacity: s.done ? 1 : 0.55,
                transition: "opacity var(--dur) var(--ease)",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                marginTop: i === 0 ? 0 : 4,
                paddingTop: i === 0 ? 0 : 12,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: s.done
                    ? "var(--primary-soft)"
                    : "var(--bg-elev-2)",
                  border: `1px solid ${s.done ? "var(--border-accent)" : "var(--border)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: s.done ? "var(--primary)" : "var(--text-faint)",
                  flexShrink: 0,
                }}
              >
                {s.done ? <Check size={16} /> : <Icon size={16} />}
              </div>
              <div className="grow">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
                <div className="field__hint">{s.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
