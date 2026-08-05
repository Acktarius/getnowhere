import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Contact } from "@/types/models";
import { initials, shortAddress, timeAgo } from "@/utils/format";
import { RelationshipStatusBadge } from "./StatusBadges";

type Props = { contact: Contact; to?: string };

export function ContactCard({ contact, to }: Props) {
  const target = to ?? `/contacts/${contact.id}`;
  return (
    <Link
      to={target}
      className="row row--clickable"
      style={{ textDecoration: "none" }}
    >
      <div className="row__avatar">{initials(contact.alias)}</div>
      <div className="row__main">
        <div className="row__title">{contact.alias}</div>
        <div className="row__sub">
          {contact.ccxAddress
            ? shortAddress(contact.ccxAddress)
            : "Finish pairing…"}
        </div>
      </div>
      <div className="row__meta">
        <RelationshipStatusBadge status={contact.relationshipStatus} />
        {contact.lastInteractionAt && (
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
            {timeAgo(contact.lastInteractionAt)}
          </span>
        )}
      </div>
      <ChevronRight
        size={16}
        style={{ color: "var(--text-faint)", flexShrink: 0 }}
      />
    </Link>
  );
}
