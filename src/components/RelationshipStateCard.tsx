import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
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
  const p2pEligible = verified && contact.relationshipStatus === "eligible";
  const allRequirementsDone =
    identityLinked && returnReceived && verified && p2pEligible;

  const [open, setOpen] = useState(!allRequirementsDone);

  const steps = [
    {
      label: "Identity linked",
      desc: "CCX address recorded",
      done: identityLinked,
      icon: Link2,
    },
    {
      label: "Return identifier received",
      desc: "paymentIdTo saved — use it when sending so they identify you",
      done: returnReceived,
      icon: ArrowLeftRight,
    },
    {
      label: "Both payment IDs present",
      desc: "Enough to identify each other on-chain — not a live session",
      done: verified,
      icon: ShieldCheck,
    },
    {
      label: "Eligible for chat invite",
      desc: "You can send or accept a chat create",
      done: p2pEligible,
      icon: Radio,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="card">
      <button
        type="button"
        className="row-flex row-flex--between"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="card__title" style={{ margin: 0 }}>
          Relationship state
        </div>
        <div className="row-flex" style={{ gap: 8, alignItems: "center" }}>
          {!open && (
            <span className="faint" style={{ fontSize: 12 }}>
              {doneCount}/{steps.length}
            </span>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      {open && (
        <div className="stack stack--gap-2" style={{ marginTop: 12 }}>
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
      )}
    </div>
  );
}
