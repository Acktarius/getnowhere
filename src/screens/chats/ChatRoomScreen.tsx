import { RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatRoomHeader } from "@/components/ChatRoomHeader";
import { EmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";
import { Sheet } from "@/components/Sheet";
import { RoomLifecyclePill } from "@/components/StatusBadges";
import { getMessagesForRoom } from "@/services/p2p/HolepunchChatTransport";
import {
  composerDisabledReason,
  isComposerEnabled,
} from "@/services/protocol/composerGate";
import { useChatStore } from "@/state/chatStore";
import { probeInitiatorHandoff, useContactsStore } from "@/state/contactsStore";
import type { ChatMessage } from "@/types/models";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function ChatRoomScreen() {
  const { roomId = "" } = useParams();
  const openRoom = useChatStore((s) => s.openRoom);
  const bootstrapRoom = useChatStore((s) => s.bootstrapRoom);
  const subscribeRoom = useChatStore((s) => s.subscribeRoom);
  const send = useChatStore((s) => s.send);
  const sendReaction = useChatStore((s) => s.sendReaction);
  const editMessage = useChatStore((s) => s.editMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const retryConnect = useChatStore((s) => s.retryConnect);
  const setMessages = useChatStore((s) => s.setMessages);
  const room = useChatStore((s) => s.rooms.find((r) => r.id === roomId));
  const messages = useChatStore(
    (s) => s.messagesByRoom[roomId] ?? EMPTY_MESSAGES,
  );
  const contactByRoom = useContactsStore((s) =>
    s.contacts.find((c) => c.roomId === roomId),
  );
  const contactId = room?.contactId || contactByRoom?.id;
  const contact = useContactsStore((s) =>
    contactId ? s.contacts.find((c) => c.id === contactId) : undefined,
  );
  const refreshInvites = useContactsStore((s) => s.refreshInvites);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [handoffHint, setHandoffHint] = useState<string | null>(null);
  const [handoffProbe, setHandoffProbe] = useState<{
    hasInitiatorKey: boolean;
    registerCount: number;
    matchingRegister: boolean;
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      setLoadingRoom(true);
      try {
        try {
          await refreshInvites();
        } catch {
          /* wallet may still be syncing */
        }
        if (cancelled) return;
        let opened = await openRoom(roomId);
        if (!opened) {
          const contactMatch = useContactsStore
            .getState()
            .contacts.find((c) => c.roomId === roomId);
          if (contactMatch) {
            const inv = useContactsStore
              .getState()
              .invites.find(
                (i) => i.contactId === contactMatch.id && i.roomId === roomId,
              );
            await bootstrapRoom(contactMatch.id, {
              roomId,
              roomKeyRef: `key:${roomId}`,
              bootstrapSource: "conceal-smart-message",
              // Never mark accepted here — that skips connect() (attempts stay 0).
              // openRoom/restore promotes to connected when session exists.
              lifecycleStatus: "pending",
              inviteId: inv?.inviteId,
              inviteExpiry: inv?.inviteExpiry,
              roomTtl: inv?.roomTtl,
            });
            opened = await openRoom(roomId);
          }
        }
        if (cancelled) return;
        setMessages(roomId, getMessagesForRoom(roomId));
        unsub = subscribeRoom(roomId);
      } finally {
        if (!cancelled) setLoadingRoom(false);
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [
    roomId,
    openRoom,
    bootstrapRoom,
    subscribeRoom,
    setMessages,
    refreshInvites,
  ]);

  // Reconnect when accepted/pending but never called connect() (attempts === 0).
  useEffect(() => {
    if (!room) return;
    const needsConnect =
      (room.lifecycleStatus === "pending" ||
        room.lifecycleStatus === "accepted" ||
        room.lifecycleStatus === "connect_failed") &&
      (room.connectAttempts ?? 0) === 0;
    if (!needsConnect && room.lifecycleStatus === "connected") return;

    let cancelled = false;
    const tick = async () => {
      try {
        // 1) Restore persisted Holepunch session (both peers).
        await openRoom(roomId);
        const latest = useChatStore
          .getState()
          .rooms.find((r) => r.id === roomId);
        if (cancelled) return;
        if (latest?.lifecycleStatus === "connected") return;

        // 2) Alice: apply on-chain register if initiator key still present.
        const probe = await probeInitiatorHandoff(roomId);
        if (cancelled) return;
        setHandoffHint(probe.detail);
        setHandoffProbe({
          hasInitiatorKey: probe.hasInitiatorKey,
          registerCount: probe.registerCount,
          matchingRegister: probe.matchingRegister,
        });
        if (probe.handoffCompleted) await openRoom(roomId);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [room?.lifecycleStatus, room?.connectAttempts, roomId, openRoom]);

  // Keep UI peer/lifecycle in sync with transport (mesh hellos + reconnect).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        if (!cancelled) await openRoom(roomId);
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomId, openRoom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  if (loadingRoom) {
    return (
      <div className="screen">
        <ChatRoomHeader
          contact={{
            id: "",
            alias: contact?.alias ?? "…",
            ccxAddress: "",
            paymentIdFrom: "",
            relationshipStatus: "pending",
            inviteStatus: "none",
            chatStatus: "unavailable",
            createdAt: "",
            updatedAt: "",
          }}
          peerStatus="offline"
          roomId={roomId}
        />
        <EmptyState title="Opening room…" body="Loading chat session." />
      </div>
    );
  }

  if (!room || !contact) {
    return (
      <div className="screen">
        <ChatRoomHeader
          contact={{
            id: "",
            alias: contact?.alias ?? "Unknown",
            ccxAddress: "",
            paymentIdFrom: "",
            relationshipStatus: "pending",
            inviteStatus: "none",
            chatStatus: "unavailable",
            createdAt: "",
            updatedAt: "",
          }}
          peerStatus="offline"
          roomId={roomId}
        />
        <EmptyState
          title="Room unavailable"
          body="This room could not be loaded."
          action={
            <Link className="btn btn--sm btn--secondary" to="/chats">
              Back to chats
            </Link>
          }
        />
      </div>
    );
  }

  const live = isComposerEnabled(room.lifecycleStatus);
  const disabledReason = composerDisabledReason(room.lifecycleStatus);
  const superseded =
    Boolean(contact.roomId) && contact.roomId !== roomId;

  async function handleSend() {
    if (!draft.trim() || !live) return;
    setSending(true);
    const text = draft.trim();
    setDraft("");
    try {
      await send(roomId, text);
    } finally {
      setSending(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryConnect(roomId);
    } finally {
      setRetrying(false);
    }
  }

  const offline = room.peerStatus === "offline";

  return (
    <div className="screen" style={{ paddingBottom: 0 }}>
      <ChatRoomHeader
        contact={contact}
        peerStatus={room.peerStatus}
        roomId={roomId}
        onShowDiagnostics={() => setDiagOpen(true)}
      />
      <div
        style={{
          padding: "8px 14px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <RoomLifecyclePill status={room.lifecycleStatus} />
        {!live && (
          <span className="muted" style={{ fontSize: 12 }}>
            {disabledReason}
          </span>
        )}
        {room.lifecycleStatus === "connect_failed" && (
          <button
            className="btn btn--sm btn--secondary"
            disabled={retrying}
            onClick={handleRetry}
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
      {superseded && (
        <div
          className="card card--pad-md"
          style={{ margin: "8px 14px 0", fontSize: 13.5 }}
        >
          This room was superseded by a newer invite ({contact.roomId}).
          <div className="row-flex" style={{ gap: 8, marginTop: 8 }}>
            <Link
              className="btn btn--sm btn--primary"
              to={`/contacts/${contact.id}`}
            >
              Open contact to Accept
            </Link>
            {contact.roomId && (
              <Link
                className="btn btn--sm btn--secondary"
                to={`/chats/${contact.roomId}`}
              >
                Open new room
              </Link>
            )}
          </div>
        </div>
      )}
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px 8px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            title={live ? "Connected room" : "Room not live yet"}
            body={
              live
                ? "Encrypted Holepunch session is ready. Messages use ChaCha20-Poly1305."
                : room.lifecycleStatus === "accepted" &&
                    (room.connectAttempts ?? 0) === 0
                  ? "Invite was accepted but Holepunch connect never ran (attempts = 0). Reconnecting…"
                  : room.lifecycleStatus === "pending"
                    ? (handoffHint ??
                      "Offline here means this device never joined Holepunch yet (still pending). Sync their on-chain accept, or send a new invite if the session key was lost.")
                    : "Invite acceptance hands off to Holepunch. Live send unlocks only when connected."
            }
            action={
              room.lifecycleStatus === "pending" ||
              (room.lifecycleStatus === "accepted" &&
                (room.connectAttempts ?? 0) === 0) ? (
                <div className="stack stack--gap-2" style={{ width: "100%" }}>
                  <button
                    className="btn btn--sm btn--secondary"
                    disabled={retrying}
                    onClick={async () => {
                      setRetrying(true);
                      try {
                        const probe = await probeInitiatorHandoff(roomId);
                        setHandoffHint(probe.detail);
                        setHandoffProbe({
                          hasInitiatorKey: probe.hasInitiatorKey,
                          registerCount: probe.registerCount,
                          matchingRegister: probe.matchingRegister,
                        });
                        await openRoom(roomId);
                      } finally {
                        setRetrying(false);
                      }
                    }}
                  >
                    <RefreshCw size={13} /> Connect now
                  </button>
                  {contact && handoffProbe && !handoffProbe.hasInitiatorKey && (
                    <Link
                      className="btn btn--sm btn--primary"
                      to={`/contacts/${contact.id}`}
                    >
                      Resend invite from contact
                    </Link>
                  )}
                </div>
              ) : undefined
            }
          />
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onReact={
                  live
                    ? (emoji) => sendReaction(roomId, m.id, emoji)
                    : undefined
                }
                onEdit={
                  live && m.direction === "out"
                    ? (text) => editMessage(roomId, m.id, text)
                    : undefined
                }
                onDelete={
                  live && m.direction === "out"
                    ? () => deleteMessage(roomId, m.id)
                    : undefined
                }
              />
            ))}
          </>
        )}
      </div>

      <div
        style={{
          padding: "10px 12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={draft}
          disabled={!live || sending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={live ? "Message…" : "Connect via Holepunch to send…"}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 40,
            maxHeight: 120,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg-elev-1)",
            color: "var(--text)",
            font: "inherit",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          className="btn btn--primary"
          disabled={!live || sending || !draft.trim()}
          onClick={() => void handleSend()}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>

      <Sheet
        open={diagOpen}
        title="Room diagnostics"
        onClose={() => setDiagOpen(false)}
      >
        <div className="stack stack--gap-2" style={{ fontSize: 13 }}>
          <div>Room id: {room.id}</div>
          <div>Lifecycle: {room.lifecycleStatus}</div>
          <div>Peer: {room.peerStatus}</div>
          <div>Bootstrap: {room.bootstrapSource}</div>
          <div>Connect attempts: {room.connectAttempts ?? 0}</div>
          <div>
            Initiator key:{" "}
            {handoffProbe
              ? handoffProbe.hasInitiatorKey
                ? "yes"
                : "NO — resend invite"
              : "…"}
          </div>
          <div>Registers scanned: {handoffProbe?.registerCount ?? "…"}</div>
          <div>
            Matching register:{" "}
            {handoffProbe
              ? handoffProbe.matchingRegister
                ? "yes"
                : "no"
              : "…"}
          </div>
          {handoffHint && <div>Handoff: {handoffHint}</div>}
          {room.lastConnectError && (
            <div>Last error: {room.lastConnectError}</div>
          )}
          <div className="row-flex" style={{ gap: 8 }}>
            {offline ? <WifiOff size={14} /> : <Wifi size={14} />}
            <span>{offline ? "Offline" : "Online"}</span>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
