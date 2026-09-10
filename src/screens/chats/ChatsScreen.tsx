import { MessageSquare, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState } from "@/components/EmptyState";
import { MobileInstantLink } from "@/components/MobileInstantLink";
import { NotifyPin } from "@/components/NotifyPin";
import { RoomTopicIcon, roomTopicLabel } from "@/components/RoomTopicIcon";
import { PeerStatusIndicator } from "@/components/StatusBadges";
import { TopBar } from "@/components/TopBar";
import { useNavNotificationBadges } from "@/hooks/useNavNotificationBadges";
import { hasPendingRoomInvite } from "@/services/contacts/inviteQueue";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { initials, shortAddress, timeAgo } from "@/utils/format";

export function ChatsScreen() {
  const rooms = useChatStore((s) => s.rooms);
  const loadRooms = useChatStore((s) => s.loadRooms);
  const messagesByRoom = useChatStore((s) => s.messagesByRoom);
  const contacts = useContactsStore((s) => s.contacts);
  const invites = useContactsStore((s) => s.invites);
  const roomPendingBadge = useNotificationStore((s) => s.roomPendingBadge);
  const roomRelayBadge = useNotificationStore((s) => s.roomRelayBadge);
  const navBadges = useNavNotificationBadges();

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const visibleRooms = useMemo(
    () => rooms.filter((r) => !isRoomRevoked(r.id)),
    [rooms],
  );

  const eligibleContacts = contacts.filter(
    (c) => c.relationshipStatus === "eligible",
  );

  return (
    <div className="screen">
      <TopBar title="Chats" subtitle="Peer-to-peer rooms" bordered />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 0 32px" }}
      >
        {visibleRooms.length === 0 && eligibleContacts.length === 0 ? (
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
            {visibleRooms.length > 0 && (
              <div className="section">
                <div className="section__head">
                  <span className="section__title">Active rooms</span>
                </div>
                <div className="card card--flush stagger">
                  {visibleRooms.map((room) => {
                    const c = contacts.find((x) => x.id === room.contactId);
                    const last = (messagesByRoom[room.id] ?? []).at(-1);
                    const pendingInvite =
                      room.lifecycleStatus === "pending" &&
                      hasPendingRoomInvite(room.id, invites);
                    const showPending = roomPendingBadge(
                      room.id,
                      pendingInvite,
                    );
                    const relayCount = roomRelayBadge(room.id);
                    const rowInner = (
                      <>
                        <div className="row__avatar-wrap">
                          <div className="row__avatar">
                            <RoomTopicIcon topicId={room.roomTopic} size={18} />
                          </div>
                          {relayCount > 0 ? (
                            <NotifyPin count={relayCount} variant="relay" />
                          ) : showPending ? (
                            <NotifyPin variant="pending" dot />
                          ) : null}
                        </div>
                        <div className="row__main">
                          <div className="row__title">
                            {c?.alias ?? "Unknown contact"}
                            <span className="muted" style={{ fontWeight: 500 }}>
                              {" "}
                              · {roomTopicLabel(room.roomTopic)}
                            </span>
                          </div>
                          <div className="row__sub">
                            {room.awaitingChainSync
                              ? "Syncing wallet — room will enable near chain tip"
                              : room.lifecycleStatus !== "connected"
                                ? `Status: ${room.lifecycleStatus}`
                                : last
                                  ? last.text.slice(0, 36)
                                  : "Connected — say hello"}
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
                      </>
                    );
                    if (room.awaitingChainSync) {
                      return (
                        <div
                          key={room.id}
                          className="row row--clickable"
                          style={{ opacity: 0.65, cursor: "not-allowed" }}
                          aria-disabled
                        >
                          {rowInner}
                        </div>
                      );
                    }
                    return (
                      <Link
                        key={room.id}
                        to={`/chats/${room.id}`}
                        className="row row--clickable"
                        style={{ textDecoration: "none" }}
                      >
                        {rowInner}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {eligibleContacts.length > 0 && (
              <div className="section">
                <div className="section__head">
                  <span className="section__title">Start a room</span>
                </div>
                <div className="card card--flush stagger">
                  {eligibleContacts.map((c) => (
                    <MobileInstantLink
                      key={c.id}
                      to={`/contacts/${c.id}`}
                      className="row row--clickable"
                      style={{ textDecoration: "none" }}
                    >
                      <div className="row__avatar">{initials(c.alias)}</div>
                      <div className="row__main">
                        <div className="row__title">{c.alias}</div>
                        <div className="row__sub">
                          {shortAddress(c.ccxAddress)} · pick a topic
                        </div>
                      </div>
                      <Plus size={16} className="muted" />
                    </MobileInstantLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav {...navBadges} />
    </div>
  );
}
