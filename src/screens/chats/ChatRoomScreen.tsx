import { RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChatRoomHeader } from "@/components/ChatRoomHeader";
import { ChatTopicBackdrop } from "@/components/ChatTopicBackdrop";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EmptyState } from "@/components/EmptyState";
import { type BubbleReaction, MessageBubble } from "@/components/MessageBubble";
import { Sheet } from "@/components/Sheet";
import { RoomLifecyclePill } from "@/components/StatusBadges";
import {
  getLastSidecarDetail,
  getMessagesForRoom,
  getTopicRefForRoom,
} from "@/services/p2p/HolepunchChatTransport";
import {
  getSidecarBridgeDiagnostic,
  getUfwAdvisoryState,
} from "@/services/p2p/HolepunchSidecarClient";
import { isRetryableConnectFailure } from "@/services/p2p/holepunchPolicy";
import { resolveRoomTtl } from "@/services/p2p/resolveRoomTtl";
import { loadCatalogRoom } from "@/services/p2p/roomCatalogStore";
import {
  canComposeMessages,
  composerDisabledReason,
  composerPreferredChannel,
} from "@/services/protocol/composerGate";
import { isRoomExpired } from "@/services/protocol/roomLifecycle";
import { useChatStore } from "@/state/chatStore";
import { probeInitiatorHandoff, useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { toastError, toastSuccess } from "@/state/toastStore";
import type { ChatMessage, ChatRoom, Contact } from "@/types/models";
import {
  type ConnectFailureCode,
  RELAY_MAX_TEXT_CHARS,
} from "@/types/protocol";
import { formatUnixDateTime } from "@/utils/format";

const EMPTY_MESSAGES: ChatMessage[] = [];

function placeholderContact(alias: string): Contact {
  return {
    id: "",
    alias,
    ccxAddress: "",
    paymentIdFrom: "",
    relationshipStatus: "pending",
    inviteStatus: "none",
    chatStatus: "unavailable",
    createdAt: "",
    updatedAt: "",
  };
}

function roomExpiryDiagnosticLine(roomTtl?: number): string {
  if (!roomTtl) return "Room expiry: —";
  const suffix = isRoomExpired(roomTtl) ? " (elapsed)" : "";
  return `Room expiry: ${formatUnixDateTime(roomTtl)}${suffix}`;
}

/** Shared leave confirmation — used from every screen state, even before the room finishes loading. */
function LeaveRoomModal({
  open,
  revoking,
  onConfirm,
  onClose,
}: {
  open: boolean;
  revoking: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <ConfirmModal
      open={open}
      title="Leave room?"
      body="This destroys the room immediately and sends an on-chain revoke to the other peer. It disappears from Chats now — no waiting for chain confirm."
      confirmLabel="LEAVE ROOM"
      cancelLabel="Cancel"
      destructive
      busyLabel="Leaving…"
      busyStatus="Destroying room…"
      onConfirm={onConfirm}
      onClose={() => {
        if (!revoking) onClose();
      }}
    />
  );
}

/** Reduced diagnostics for states where the full room record isn't loaded yet. */
function LoadingDiagnosticsSheet({
  open,
  roomId,
  contactAlias,
  roomTtl,
  onClose,
}: {
  open: boolean;
  roomId: string;
  contactAlias?: string;
  roomTtl?: number;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title="Room diagnostics" onClose={onClose}>
      <div className="stack stack--gap-2" style={{ fontSize: 13 }}>
        <div>Room id: {roomId}</div>
        <div>Contact: {contactAlias ?? "…"}</div>
        <div>{roomExpiryDiagnosticLine(roomTtl)}</div>
        <div>Sidecar: {getSidecarBridgeDiagnostic()}</div>
        {getLastSidecarDetail() && (
          <div>Sidecar status: {getLastSidecarDetail()}</div>
        )}
        <div className="muted" style={{ fontSize: 12 }}>
          Full room state appears once opening finishes.
        </div>
      </div>
    </Sheet>
  );
}

export function ChatRoomScreen() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
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
  const refreshRelays = useChatStore((s) => s.refreshRelays);
  const revokeRoom = useContactsStore((s) => s.revokeRoom);
  const inviteForRoom = useContactsStore((s) =>
    s.invites.find((i) => i.roomId === roomId),
  );
  const diagnosticRoomTtl = resolveRoomTtl({
    roomId,
    roomTtl: room?.roomTtl,
    inviteId: room?.inviteId ?? inviteForRoom?.inviteId,
    inviteRecordTtl: inviteForRoom?.roomTtl,
  });

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [openingRoom, setOpeningRoom] = useState(
    () => !useChatStore.getState().rooms.some((r) => r.id === roomId),
  );
  const [handoffHint, setHandoffHint] = useState<string | null>(null);
  const [handoffProbe, setHandoffProbe] = useState<{
    hasInitiatorKey: boolean;
    role: "initiator" | "responder" | "unknown";
    registerCount: number;
    matchingRegister: boolean;
    needsAccept?: boolean;
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!roomId) return;
    useNotificationStore.getState().markRoomSeen(roomId);
  }, [roomId]);

  const catalogRoom = useMemo(() => loadCatalogRoom(roomId), [roomId]);

  const displayRoom: ChatRoom = useMemo(() => {
    if (room) return room;
    if (catalogRoom) {
      return { ...catalogRoom, peerStatus: "offline", connectAttempts: 0 };
    }
    return {
      id: roomId,
      contactId: inviteForRoom?.contactId ?? "",
      bootstrapSource: "conceal-smart-message",
      roomKeyRef: `key:${roomId}`,
      peerStatus: "offline",
      lifecycleStatus: "pending",
      roomTopic: inviteForRoom?.roomTopic,
      inviteId: inviteForRoom?.inviteId,
      inviteExpiry: inviteForRoom?.inviteExpiry,
      roomTtl: inviteForRoom?.roomTtl,
      connectAttempts: 0,
      createdAt: "",
    };
  }, [room, catalogRoom, roomId, inviteForRoom]);

  const linkedContact = useContactsStore((s) => {
    const cid = displayRoom.contactId;
    return cid ? s.contacts.find((c) => c.id === cid) : undefined;
  });

  const displayContact =
    contact ?? contactByRoom ?? linkedContact ?? placeholderContact("…");

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const hadRoom = Boolean(
        useChatStore.getState().rooms.find((r) => r.id === roomId),
      );
      if (!hadRoom) setOpeningRoom(true);
      try {
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
              roomTopic: inv?.roomTopic,
            });
            opened = await openRoom(roomId);
          }
        }
        if (cancelled) return;
        setMessages(roomId, getMessagesForRoom(roomId));
        unsub = subscribeRoom(roomId);
      } finally {
        if (!cancelled) setOpeningRoom(false);
      }
      if (cancelled) return;
      void refreshInvites().catch(() => {});
      void refreshRelays().catch(() => {});
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
    refreshRelays,
  ]);

  // Reconnect when accepted/pending but never called connect() (attempts === 0).
  useEffect(() => {
    if (!room) return;
    // crypto_mismatch is not auto-retryable — session keys diverged; user must
    // resend/accept.  Stop polling immediately to prevent the connected↔mismatch loop.
    if (
      room.lifecycleStatus === "connect_failed" &&
      !isRetryableConnectFailure(
        (room.lastConnectError ?? "unknown") as ConnectFailureCode,
      )
    )
      return;
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
          role: probe.role,
          registerCount: probe.registerCount,
          matchingRegister: probe.matchingRegister,
          needsAccept: probe.needsAccept,
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

  // Keep UI peer/lifecycle in sync; always rescan L3 (Holepunch can fail mid-chat).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        if (cancelled) return;
        await openRoom(roomId);
        await refreshRelays();
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [roomId, openRoom, refreshRelays]);

  // One-shot rescan when room becomes relay-eligible (pending → accepted/…).
  useEffect(() => {
    if (!room) return;
    if (
      room.lifecycleStatus === "accepted" ||
      room.lifecycleStatus === "connecting" ||
      room.lifecycleStatus === "connect_failed"
    ) {
      void refreshRelays().catch(() => {});
    }
  }, [room?.lifecycleStatus, refreshRelays]);

  const reactionsByTarget = useMemo(() => {
    const map = new Map<string, BubbleReaction[]>();
    for (const m of messages) {
      if (m.kind !== "reaction" || !m.targetMessageId || !m.reaction) continue;
      const list = map.get(m.targetMessageId) ?? [];
      list.push({
        emoji: m.reaction,
        from: m.direction === "out" ? "me" : "peer",
      });
      map.set(m.targetMessageId, list);
    }
    return map;
  }, [messages]);

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.kind !== "reaction" && m.kind !== "edit"),
    [messages],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleMessages.length]);

  const composeAllowed =
    !openingRoom &&
    canComposeMessages(displayRoom.lifecycleStatus) &&
    !displayRoom.awaitingChainSync;
  const sendChannel = composerPreferredChannel(displayRoom.lifecycleStatus);
  const viaChain = composeAllowed && sendChannel === "relay";
  /** True Holepunch L2; relay compose is separate. @see docs/security/encryption.md */
  const holepunchLive = displayRoom.lifecycleStatus === "connected";
  const disabledReason = openingRoom
    ? "Opening room…"
    : composerDisabledReason(
        displayRoom.lifecycleStatus,
        displayRoom.lastConnectError,
        displayRoom.awaitingChainSync,
      );
  const showUfwAdvisory =
    displayRoom.lifecycleStatus === "connect_failed" &&
    isRetryableConnectFailure(
      (displayRoom.lastConnectError ?? "unknown") as ConnectFailureCode,
    ) &&
    getUfwAdvisoryState() === "active";

  async function handleSend() {
    if (!draft.trim() || !composeAllowed || sending) return;
    if (viaChain && draft.trim().length > RELAY_MAX_TEXT_CHARS) {
      toastError(
        `Via-chain messages are limited to ${RELAY_MAX_TEXT_CHARS} characters.`,
      );
      return;
    }
    setSending(true);
    const text = draft.trim();
    setDraft("");
    composerRef.current?.focus();
    try {
      await send(roomId, text);
    } catch (e) {
      toastError((e as Error).message || "Send failed.");
    } finally {
      setSending(false);
      composerRef.current?.focus();
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

  async function handleRevokeConfirm() {
    if (revoking) return;
    setRevoking(true);
    try {
      await revokeRoom(roomId);
      toastSuccess("Room left.");
      navigate("/chats", { replace: true });
    } catch (e) {
      toastError((e as Error).message || "Leave failed.");
      throw e;
    } finally {
      setRevoking(false);
    }
  }

  if (!openingRoom && !room && !catalogRoom) {
    return (
      <div className="screen">
        <ChatRoomHeader
          contact={displayContact}
          peerStatus="offline"
          roomId={roomId}
          roomTopic={displayRoom.roomTopic}
          onShowDiagnostics={() => setDiagOpen(true)}
          onLeaveRoom={() => setLeaveOpen(true)}
          leaving={revoking}
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
        <LoadingDiagnosticsSheet
          open={diagOpen}
          roomId={roomId}
          contactAlias={displayContact.alias}
          roomTtl={diagnosticRoomTtl}
          onClose={() => setDiagOpen(false)}
        />
        <LeaveRoomModal
          open={leaveOpen}
          revoking={revoking}
          onConfirm={handleRevokeConfirm}
          onClose={() => setLeaveOpen(false)}
        />
      </div>
    );
  }

  const offline = displayRoom.peerStatus === "offline";

  return (
    <div
      className="screen"
      style={{
        paddingBottom: 0,
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
      }}
    >
      <ChatRoomHeader
        contact={displayContact}
        peerStatus={displayRoom.peerStatus}
        roomId={roomId}
        roomTopic={displayRoom.roomTopic}
        onShowDiagnostics={() => setDiagOpen(true)}
        onLeaveRoom={() => setLeaveOpen(true)}
        leaving={revoking}
      />
      <div
        style={{
          padding: "8px 14px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <RoomLifecyclePill status={displayRoom.lifecycleStatus} />
        {!composeAllowed && (
          <span className="muted" style={{ fontSize: 12 }}>
            {disabledReason}
          </span>
        )}
        {viaChain && (
          <span
            className="muted"
            style={{ fontSize: 12 }}
            title="Messages send over blockchain until Holepunch connects."
          >
            Messages via chain fallback
          </span>
        )}
        {displayRoom.lifecycleStatus === "connect_failed" &&
          displayRoom.lastConnectError && (
            <span
              className="muted"
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono, monospace)",
              }}
              title={disabledReason ?? undefined}
            >
              [{displayRoom.lastConnectError}]
            </span>
          )}
        {displayRoom.lifecycleStatus === "connect_failed" && (
          <button
            className="btn btn--sm btn--secondary"
            disabled={retrying}
            onClick={handleRetry}
          >
            <RefreshCw size={13} /> Retry
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <ChatTopicBackdrop topicId={displayRoom.roomTopic} />
        <div
          ref={scrollerRef}
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "16px 14px 8px",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
          }}
        >
          {visibleMessages.length === 0 ? (
            <EmptyState
              title={
                openingRoom
                  ? "Opening room…"
                  : holepunchLive
                    ? "Connected room"
                    : viaChain
                      ? "Connected via chain fallback"
                      : "Room not live yet"
              }
              body={
                openingRoom
                  ? "Loading chat session."
                  : holepunchLive
                    ? "Encrypted Holepunch session is ready. Messages use ChaCha20-Poly1305."
                    : viaChain
                      ? "Holepunch hasn't connected yet. Messages send over the blockchain (Conceal-encrypted memo) until it does — this is not the Holepunch/ChaCha20-Poly1305 session."
                      : displayRoom.lifecycleStatus === "accepted" &&
                          (displayRoom.connectAttempts ?? 0) === 0
                        ? "Invite was accepted but Holepunch connect never ran (attempts = 0). Reconnecting…"
                        : displayRoom.lifecycleStatus === "pending"
                          ? (handoffHint ??
                            "Offline here means this device never joined Holepunch yet (still pending). Sync their on-chain accept, or send a new invite if the session key was lost.")
                          : "Invite acceptance hands off to Holepunch. Live send unlocks only when connected."
              }
              action={
                openingRoom ? undefined : displayRoom.lifecycleStatus ===
                    "pending" ||
                  (displayRoom.lifecycleStatus === "accepted" &&
                    (displayRoom.connectAttempts ?? 0) === 0) ? (
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
                            role: probe.role,
                            registerCount: probe.registerCount,
                            matchingRegister: probe.matchingRegister,
                            needsAccept: probe.needsAccept,
                          });
                          await openRoom(roomId);
                        } finally {
                          setRetrying(false);
                        }
                      }}
                    >
                      <RefreshCw size={13} /> Connect now
                    </button>
                    {displayContact.id && handoffProbe?.needsAccept && (
                      <Link
                        className="btn btn--sm btn--primary"
                        to={`/contacts/${displayContact.id}`}
                      >
                        Open contact to Accept
                      </Link>
                    )}
                    {displayContact.id &&
                      handoffProbe &&
                      !handoffProbe.hasInitiatorKey &&
                      handoffProbe.role !== "responder" &&
                      !handoffProbe.needsAccept && (
                        <Link
                          className="btn btn--sm btn--primary"
                          to={`/contacts/${displayContact.id}`}
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
              {visibleMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  reactions={reactionsByTarget.get(m.id)}
                  onReact={
                    holepunchLive
                      ? (emoji) => sendReaction(roomId, m.id, emoji)
                      : undefined
                  }
                  onEdit={
                    holepunchLive && m.direction === "out"
                      ? (text) => editMessage(roomId, m.id, text)
                      : undefined
                  }
                  onDelete={
                    holepunchLive && m.direction === "out"
                      ? () => deleteMessage(roomId, m.id)
                      : undefined
                  }
                />
              ))}
            </>
          )}
        </div>
      </div>

      <div
        style={{
          padding: "10px 12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
          background: "var(--bg)",
        }}
      >
        <textarea
          ref={composerRef}
          value={draft}
          disabled={!composeAllowed}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            !composeAllowed
              ? (disabledReason ?? "Messaging unavailable…")
              : viaChain
                ? `Message via chain (max ${RELAY_MAX_TEXT_CHARS})…`
                : "Message…"
          }
          rows={1}
          maxLength={viaChain ? RELAY_MAX_TEXT_CHARS : undefined}
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
          type="button"
          className="btn btn--primary"
          disabled={!composeAllowed || sending || !draft.trim()}
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
          <div>Room id: {displayRoom.id}</div>
          {/* Must match the peer's value and the sidecar's `topic <prefix>…` log. */}
          <div>
            Topic: {getTopicRefForRoom(displayRoom.id) ?? "— not joined yet —"}
          </div>
          <div>Lifecycle: {displayRoom.lifecycleStatus}</div>
          <div>{roomExpiryDiagnosticLine(diagnosticRoomTtl)}</div>
          <div>Peer: {displayRoom.peerStatus}</div>
          <div>Bootstrap: {displayRoom.bootstrapSource}</div>
          <div>Connect attempts: {displayRoom.connectAttempts ?? 0}</div>
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
          {displayRoom.lastConnectError && (
            <div>Last error: {displayRoom.lastConnectError}</div>
          )}
          <div>Sidecar: {getSidecarBridgeDiagnostic()}</div>
          {getLastSidecarDetail() && (
            <div>Sidecar status: {getLastSidecarDetail()}</div>
          )}
          {showUfwAdvisory && (
            <div className="muted" style={{ fontSize: 12 }}>
              UFW appears active on this machine and may be blocking
              Holepunch&apos;s dynamic UDP traffic (separate from the localhost
              bridge on port 7901). Check your firewall rules if this keeps
              failing.
            </div>
          )}
          <div className="row-flex" style={{ gap: 8 }}>
            {offline ? <WifiOff size={14} /> : <Wifi size={14} />}
            <span>{offline ? "Offline" : "Online"}</span>
          </div>
        </div>
      </Sheet>

      <LeaveRoomModal
        open={leaveOpen}
        revoking={revoking}
        onConfirm={handleRevokeConfirm}
        onClose={() => setLeaveOpen(false)}
      />
    </div>
  );
}
