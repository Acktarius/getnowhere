import { MessageSquare, Plus } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { PeerStatusIndicator } from "@/components/StatusBadges";
import { TopBar } from "@/components/TopBar";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { initials, shortAddress, timeAgo } from "@/utils/format";

export function ChatsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const loadRooms = useChatStore((s) => s.loadRooms);
  const messagesByRoom = useChatStore((s) => s.messagesByRoom);
  const contacts = useContactsStore((s) => s.contacts);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const eligibleContacts = contacts.filter(
    (c) =>
      c.relationshipStatus === "established" &&
      !rooms.some((r) => r.contactId === c.id),
  );

  return (
    <div className="screen">
      <TopBar title="Chats" subtitle="Peer-to-peer rooms" bordered />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 0 32px" }}
      >
        {rooms.length === 0 && eligibleContacts.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No active chats"
            body="Once you establish a relationship and send a chat invite, your encrypted P2P rooms will appear here."
            action={
              <Link className="btn btn--sm btn--secondary" to="/contacts">
                Go to contacts
              </Link>
            }
          />
        ) : (
          <>
            {rooms.length > 0 && (
              <div className="section">
                <div className="section__head">
                  <span className="section__title">Active rooms</span>
                </div>
                <div className="card card--flush stagger">
                  {rooms.map((room) => {
                    const c = contacts.find((x) => x.id === room.contactId);
                    const last = (messagesByRoom[room.id] ?? []).at(-1);
                    return (
                      <Link
                        key={room.id}
                        to={`/chats/${room.id}`}
                        className="row row--clickable"
                        style={{ textDecoration: "none" }}
                      >
                        <div className="row__avatar">
                          {c ? initials(c.alias) : "?"}
                        </div>
                        <div className="row__main">
                          <div className="row__title">
                            {c?.alias ?? "Unknown contact"}
                          </div>
                          <div className="row__sub">
                            {last
                              ? last.text.slice(0, 36)
                              : "Room ready — say hello"}
                          </div>
                        </div>
                        <div className="row__meta">
                          <PeerStatusIndicator status={room.peerStatus} />
                          {room.lastMessageAt && (
                            <span className="faint" style={{ fontSize: 11 }}>
                              {timeAgo(room.lastMessageAt)}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {eligibleContacts.length > 0 && (
              <div className="section">
                <div className="section__head">
                  <span className="section__title">Ready to invite</span>
                </div>
                <div className="card card--flush stagger">
                  {eligibleContacts.map((c) => (
                    <Link
                      key={c.id}
                      to={`/contacts/${c.id}`}
                      className="row row--clickable"
                      style={{ textDecoration: "none" }}
                    >
                      <div className="row__avatar">{initials(c.alias)}</div>
                      <div className="row__main">
                        <div className="row__title">{c.alias}</div>
                        <div className="row__sub">
                          {shortAddress(c.ccxAddress)}
                        </div>
                      </div>
                      <div className="row__meta">
                        <span className="pill pill--eligible">
                          <Plus size={11} /> Invite
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
