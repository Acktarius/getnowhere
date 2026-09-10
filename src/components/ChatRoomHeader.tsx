import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { MobileInstantLink } from "@/components/MobileInstantLink";
import { RoomTopicIcon, roomTopicLabel } from "@/components/RoomTopicIcon";
import type { RoomTopicId } from "@/services/protocol/roomTopics";
import type { Contact } from "@/types/models";
import { initials } from "@/utils/format";
import { PeerStatusIndicator } from "./StatusBadges";

type Props = {
  contact: Contact;
  peerStatus: "offline" | "connecting" | "online";
  roomId: string;
  roomTopic?: RoomTopicId;
  onShowDiagnostics?: () => void;
  /** Opens leave confirmation — L1 revoke + destroy room. */
  onLeaveRoom?: () => void;
  leaving?: boolean;
};

export function ChatRoomHeader({
  contact,
  peerStatus,
  roomId,
  roomTopic,
  onShowDiagnostics,
  onLeaveRoom,
  leaving,
}: Props) {
  return (
    <header className="topbar topbar--bordered">
      <MobileInstantLink
        to="/chats"
        className="topbar__icon-btn"
        aria-label="Back to chats"
      >
        <ChevronLeft size={20} />
      </MobileInstantLink>
      <div
        className="row__avatar"
        style={{ width: 34, height: 34, fontSize: 13 }}
      >
        {initials(contact.alias)}
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="topbar__title">
          {contact.alias}
          <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>
            <RoomTopicIcon topicId={roomTopic} size={14} />{" "}
            {roomTopicLabel(roomTopic)}
          </span>
        </div>
        <div style={{ marginTop: 2 }}>
          <PeerStatusIndicator status={peerStatus} />
        </div>
      </div>
      {onLeaveRoom && (
        <button
          type="button"
          className="btn btn--sm btn--ghost topbar__leave-btn"
          onClick={onLeaveRoom}
          disabled={leaving}
        >
          {leaving ? "Leaving…" : "LEAVE ROOM"}
        </button>
      )}
      {onShowDiagnostics && (
        <button
          className="topbar__icon-btn"
          onClick={onShowDiagnostics}
          aria-label="Diagnostics"
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      <span className="sr-only">Room {roomId}</span>
    </header>
  );
}
