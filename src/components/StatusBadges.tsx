import type {
  ChatStatus,
  InviteStatus,
  RelationshipStatus,
} from "@/types/models";

type Props = { status: RelationshipStatus };

const LABELS: Record<RelationshipStatus, string> = {
  pending: "Pending",
  established: "Established",
  blocked: "Blocked",
  archived: "Archived",
};

export function RelationshipStatusBadge({ status }: Props) {
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" />
      {LABELS[status]}
    </span>
  );
}

export function InviteStatusPill({ status }: { status: InviteStatus }) {
  const labels: Record<InviteStatus, string> = {
    none: "No invite",
    sent: "Invite sent",
    received: "Invite received",
    accepted: "Invite accepted",
    expired: "Invite expired",
  };
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" />
      {labels[status]}
    </span>
  );
}

export function ChatStatusPill({ status }: { status: ChatStatus }) {
  const labels: Record<ChatStatus, string> = {
    unavailable: "Chat unavailable",
    eligible: "Chat eligible",
    invited: "Room invited",
    active: "Room active",
  };
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" />
      {labels[status]}
    </span>
  );
}

export function PeerStatusIndicator({
  status,
}: {
  status: "offline" | "connecting" | "online";
}) {
  const labels = {
    offline: "offline",
    connecting: "connecting…",
    online: "online",
  };
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" />
      {labels[status]}
    </span>
  );
}
