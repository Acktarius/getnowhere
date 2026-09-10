import { ChevronRight } from "lucide-react";
import { MobileInstantLink } from "@/components/MobileInstantLink";
import { NotifyPin } from "@/components/NotifyPin";
import {
  contactInviteIsZeroConf,
  getContactInviteActionCount,
} from "@/services/contacts/inviteQueue";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import type { Contact } from "@/types/models";
import { initials, shortAddress, timeAgo } from "@/utils/format";
import { RelationshipStatusBadge } from "./StatusBadges";

type Props = { contact: Contact; to?: string };

export function ContactCard({ contact, to }: Props) {
  const target = to ?? `/contacts/${contact.id}`;
  const invites = useContactsStore((s) => s.invites);
  const rooms = useChatStore((s) => s.rooms);
  const actionCount = getContactInviteActionCount(contact, invites);
  const inviteBadge = useNotificationStore((s) =>
    s.contactInviteBadge(contact.id, actionCount),
  );
  const registerBadge = useNotificationStore((s) =>
    s.contactRegisterBadge(contact.id),
  );
  const relayBadge = useNotificationStore((s) =>
    s.contactRelayBadge(contact.id, rooms),
  );
  const invitePulse = contactInviteIsZeroConf(contact, invites);

  return (
    <MobileInstantLink
      to={target}
      className="row row--clickable"
      style={{ textDecoration: "none" }}
    >
      <div className="row__avatar-wrap">
        <div className="row__avatar">{initials(contact.alias)}</div>
        {inviteBadge > 0 ? (
          <NotifyPin count={inviteBadge} variant="invite" pulse={invitePulse} />
        ) : registerBadge ? (
          <NotifyPin variant="register" dot pulse={invitePulse} />
        ) : relayBadge > 0 ? (
          <NotifyPin count={relayBadge} variant="relay" />
        ) : null}
      </div>
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
    </MobileInstantLink>
  );
}
