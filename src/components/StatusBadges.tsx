import type {
  ChatStatus,
  InviteStatus,
  RelationshipStatus,
  RoomLifecycleStatus,
} from "@/types/models";

type Props = { status: RelationshipStatus };

/** Relationship = payment-ID completeness only — never implies a live session. */
const LABELS: Record<RelationshipStatus, string> = {
  pending: "Pending",
  eligible: "Eligible",
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
    rejected: "Declined",
    expired: "Invite expired",
    failed: "Invite failed",
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
    ready: "Ready to invite",
    invited: "Invite pending",
    connecting: "Connecting…",
    active: "Connected",
  };
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" />
      {labels[status]}
    </span>
  );
}

export function RoomLifecyclePill({ status }: { status: RoomLifecycleStatus }) {
  const labels: Record<RoomLifecycleStatus, string> = {
    pending: "Pending",
    accepted: "Accepted",
    connecting: "Connecting",
    connected: "Connected",
    connect_failed: "Connect failed",
    declined: "Declined",
    expired: "Expired",
    failed: "Failed",
    closed: "Closed",
    destroyed: "Destroyed",
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
