import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import type { Contact } from "@/types/models";
import { initials } from "@/utils/format";
import { PeerStatusIndicator } from "./StatusBadges";

type Props = {
  contact: Contact;
  peerStatus: "offline" | "connecting" | "online";
  roomId: string;
  onShowDiagnostics?: () => void;
};

export function ChatRoomHeader({
  contact,
  peerStatus,
  roomId,
  onShowDiagnostics,
}: Props) {
  return (
    <header className="topbar topbar--bordered">
      <Link to="/chats" className="topbar__icon-btn" aria-label="Back to chats">
        <ChevronLeft size={20} />
      </Link>
      <div
        className="row__avatar"
        style={{ width: 34, height: 34, fontSize: 13 }}
      >
        {initials(contact.alias)}
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="topbar__title">{contact.alias}</div>
        <div style={{ marginTop: 2 }}>
          <PeerStatusIndicator status={peerStatus} />
        </div>
      </div>
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
