import {
  Archive,
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Lock,
  MessageSquarePlus,
  Share2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmModal } from "@/components/ConfirmModal";
import { EmptyState } from "@/components/EmptyState";
import { NotifyPin } from "@/components/NotifyPin";
import { PaymentIdField } from "@/components/PaymentIdField";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { RelationshipStateCard } from "@/components/RelationshipStateCard";
import { RoomTopicIcon, roomTopicLabel } from "@/components/RoomTopicIcon";
import { Sheet } from "@/components/Sheet";
import {
  ContactRoomCountPill,
  InviteStatusPill,
  RelationshipStatusBadge,
} from "@/components/StatusBadges";
import { BackLink, TopBar } from "@/components/TopBar";
import { useCopy } from "@/hooks/useCopy";
import {
  getContactInviteActionCount,
  getInviteQueue,
} from "@/services/contacts/inviteQueue";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { listCatalogRooms } from "@/services/p2p/roomCatalogStore";
import { hasOpenRoomForTopic } from "@/services/protocol/multiRoom";
import { isRelayEligibleStatus } from "@/services/protocol/roomLifecycle";
import { ROOM_TOPICS } from "@/services/protocol/roomTopics";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";
import { toastError } from "@/state/toastStore";
import { shortAddress, timeAgo } from "@/utils/format";

export function ContactDetailScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const contact = useContactsStore((s) => s.getById(id));
  const getById = useContactsStore((s) => s.getById);
  const savePaymentIdTo = useContactsStore((s) => s.savePaymentIdTo);
  const updateContact = useContactsStore((s) => s.updateContact);
  const removeContact = useContactsStore((s) => s.removeContact);
  const archiveContact = useContactsStore((s) => s.archiveContact);
  const blockContact = useContactsStore((s) => s.blockContact);
  const sendInvite = useContactsStore((s) => s.sendInvite);
  const acceptInvite = useContactsStore((s) => s.acceptInvite);
  const declineInvite = useContactsStore((s) => s.declineInvite);
  const refreshInvites = useContactsStore((s) => s.refreshInvites);
  const invites = useContactsStore((s) => s.invites);
  const contactRoomId = useContactsStore((s) => s.getById(id)?.roomId);
  const rooms = useChatStore((s) => s.rooms);
  const roomRelayBadge = useNotificationStore((s) => s.roomRelayBadge);
  const bootstrapRoom = useChatStore((s) => s.bootstrapRoom);
  const roomLive = useChatStore((s) => {
    if (!contactRoomId) return false;
    const room = s.rooms.find((r) => r.id === contactRoomId);
    return (
      room?.lifecycleStatus === "connected" && room.peerStatus === "online"
    );
  });
  /** Latest contact room is on L1 relay (Holepunch not connected yet). */
  const roomRelayActive = useChatStore((s) => {
    if (!contactRoomId) return false;
    const room = s.rooms.find((r) => r.id === contactRoomId);
    return Boolean(room && isRelayEligibleStatus(room.lifecycleStatus));
  });

  const [copiedAddr, copyAddr] = useCopy();
  const [copiedFrom, copyFrom] = useCopy();
  const [sendingInvite, setSendingInvite] = useState(false);
  const [createSheet, setCreateSheet] = useState(false);
  const [inviteExpiryHours, setInviteExpiryHours] = useState(24);
  const [roomTtlDays, setRoomTtlDays] = useState(7);
  const [roomTopic, setRoomTopic] =
    useState<import("@/services/protocol/roomTopics").RoomTopicId>("general");
  const [shareSheet, setShareSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmSameTopic, setConfirmSameTopic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteAction, setInviteAction] = useState<"accept" | "decline" | null>(
    null,
  );
  const [refreshingInvite, setRefreshingInvite] = useState(false);
  const markContactSeen = useNotificationStore((s) => s.markContactSeen);

  const contactRooms = useMemo(() => {
    if (!id) return [];
    return listCatalogRooms()
      .filter((r) => r.contactId === id && !isRoomRevoked(r.id))
      .sort((a, b) =>
        (b.lastMessageAt ?? b.createdAt).localeCompare(
          a.lastMessageAt ?? a.createdAt,
        ),
      );
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const c = useContactsStore.getState().getById(id);
    if (!c) return;
    const actionCount = getContactInviteActionCount(
      c,
      useContactsStore.getState().invites,
    );
    markContactSeen(id, actionCount);
  }, [id, markContactSeen]);

  // Sync + scan on-chain creates so inviteStatus becomes "received" and Accept shows.
  // Poll while waiting — mempool txs are near-instant; one-shot mount miss them.
  useEffect(() => {
    let cancelled = false;
    let first = true;
    const run = async () => {
      if (first) setRefreshingInvite(true);
      try {
        await refreshInvites();
      } catch {
        /* wallet may still be syncing */
      } finally {
        if (first && !cancelled) setRefreshingInvite(false);
        first = false;
      }
    };
    void run();
    const id = window.setInterval(() => {
      void run();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [id, refreshInvites]);

  const inviteQueueForContact = getInviteQueue(id, invites);
  const incomingInviteRoomId =
    contact?.relationshipStatus === "eligible"
      ? inviteQueueForContact.newest?.roomId
      : undefined;
  const inviteRoom = useChatStore((s) =>
    incomingInviteRoomId
      ? s.rooms.find((r) => r.id === incomingInviteRoomId)
      : undefined,
  );
  const acceptAwaitingSync = Boolean(inviteRoom?.awaitingChainSync);

  if (!contact) {
    return (
      <div className="screen">
        <TopBar title="Contact" leading={<BackLink to="/contacts" />} />
        <EmptyState
          title="Contact not found"
          body="This contact may have been deleted."
          action={
            <Link className="btn btn--sm btn--secondary" to="/contacts">
              Back to contacts
            </Link>
          }
        />
      </div>
    );
  }

  const eligible = contact.relationshipStatus === "eligible";
  const inviteQueue = inviteQueueForContact;
  const incomingInvite = eligible ? inviteQueue.newest : undefined;
  const queuedOthers = inviteQueue.others;
  /** Newer create must show Accept even if an older invite was already accepted. */
  const showAccept = Boolean(
    incomingInvite &&
      (contact.inviteStatus === "received" ||
        contact.roomId !== incomingInvite.roomId),
  );
  const canInvite =
    eligible && !showAccept && contact.inviteStatus !== "received";
  /** Create another room with this contact (topic is chosen in the sheet). */
  const canNewTopicRoom = eligible && !showAccept;
  /** Allow resend whenever the Holepunch room is not actually live. */
  const canResend =
    eligible &&
    !showAccept &&
    (contact.inviteStatus === "sent" ||
      contact.inviteStatus === "failed" ||
      contact.inviteStatus === "accepted" ||
      contact.chatStatus === "active" ||
      contact.chatStatus === "connecting" ||
      contact.chatStatus === "invited") &&
    !roomLive;

  function handleResendInvite() {
    // Open create sheet — does not abandon existing rooms. Same-topic confirm
    // runs when the user submits Create.
    setCreateSheet(true);
  }

  async function handleInvite() {
    if (!contact) return;
    if (hasOpenRoomForTopic(listCatalogRooms(), contact.id, roomTopic)) {
      setConfirmSameTopic(true);
      return;
    }
    await submitInvite();
  }

  async function submitInvite() {
    if (!contact) return;
    setError(null);
    setSendingInvite(true);
    try {
      const { roomId } = await sendInvite(contact.id, contact.alias, {
        inviteExpirySec: inviteExpiryHours * 3600,
        roomTtlSec: roomTtlDays * 86400,
        roomTopic,
      });
      setCreateSheet(false);
      setConfirmSameTopic(false);
      navigate(`/chats/${roomId}`);
    } catch (e) {
      const msg = (e as Error).message || "Failed to create room.";
      setError(msg);
      toastError(msg);
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleAccept() {
    if (!incomingInvite) {
      await refreshInvites();
      return;
    }
    setInviteAction("accept");
    setError(null);
    try {
      const { roomId } = await acceptInvite(incomingInvite.id);
      navigate(`/chats/${roomId}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toastError(msg);
    } finally {
      setInviteAction(null);
    }
  }

  async function handleDecline() {
    if (!incomingInvite) return;
    setInviteAction("decline");
    setError(null);
    try {
      await declineInvite(incomingInvite.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInviteAction(null);
    }
  }

  async function handleOpenChat() {
    if (!contact) return;
    setError(null);
    try {
      // Alice: pick up Bob's on-chain register before opening.
      try {
        await refreshInvites();
      } catch {
        /* sync may still be running */
      }
      const latest = getById(contact.id) ?? contact;
      if (latest.roomId) {
        const inv = invites.find(
          (i) => i.contactId === latest.id && i.roomId === latest.roomId,
        );
        await bootstrapRoom(latest.id, {
          roomId: latest.roomId,
          roomKeyRef: `key:${latest.roomId}`,
          bootstrapSource: "conceal-smart-message",
          // pending shell only — connect/restore sets accepted→connected
          lifecycleStatus: "pending",
          inviteId: inv?.inviteId,
          inviteExpiry: inv?.inviteExpiry,
          roomTtl: inv?.roomTtl,
        });
        navigate(`/chats/${latest.roomId}`);
        return;
      }
      const room = await bootstrapRoom(contact.id, {
        roomId: `room_${contact.id.slice(2)}`,
        roomKeyRef: `rk_${contact.id.slice(-12)}`,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "pending",
      });
      navigate(`/chats/${room.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="screen">
      <TopBar
        title={contact.alias}
        leading={<BackLink to="/contacts" />}
        trailing={
          <button
            className="topbar__icon-btn"
            onClick={() => setShareSheet(true)}
            aria-label="Share identity"
          >
            <Share2 size={17} />
          </button>
        }
        bordered
      />
      <div
        className="screen-scroll stack stack--gap-4"
        style={{ padding: "16px 16px 32px" }}
      >
        <div
          className="card center stack stack--gap-3 fade-in-up"
          style={{ padding: "24px" }}
        >
          <div
            className="row__avatar"
            style={{ width: 64, height: 64, fontSize: 22 }}
          >
            {contact.alias.slice(0, 2).toUpperCase()}
          </div>
          <div className="stack stack--gap-1">
            <h2 style={{ fontSize: 20 }}>{contact.alias}</h2>
            <div className="mono faint" style={{ fontSize: 12 }}>
              {shortAddress(contact.ccxAddress, 14, 14)}
            </div>
          </div>
          <div
            className="row-flex wrap"
            style={{ gap: 6, justifyContent: "center" }}
          >
            <RelationshipStatusBadge status={contact.relationshipStatus} />
            <InviteStatusPill status={contact.inviteStatus} />
            <ContactRoomCountPill count={contactRooms.length} />
          </div>
          <div
            className="row-flex"
            style={{ gap: 8, justifyContent: "center", marginTop: 4 }}
          >
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => copyAddr(contact.ccxAddress)}
            >
              {copiedAddr ? <Check size={13} /> : <Copy size={13} />}{" "}
              {copiedAddr ? "Copied" : "Copy address"}
            </button>
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => copyFrom(contact.paymentIdFrom)}
            >
              {copiedFrom ? <Check size={13} /> : <Copy size={13} />}{" "}
              {copiedFrom ? "Copied" : "Copy your ID"}
            </button>
          </div>
          {contact.lastInteractionAt && (
            <div className="faint" style={{ fontSize: 11.5 }}>
              Last interaction {timeAgo(contact.lastInteractionAt)}
            </div>
          )}
        </div>

        <RelationshipStateCard contact={contact} />

        {contactRooms.length > 0 && (
          <div className="stack stack--gap-2 fade-in-up">
            <div className="card__title" style={{ paddingLeft: 4 }}>
              Rooms
            </div>
            <div className="card card--flush">
              {contactRooms.map((catalog) => {
                const live = rooms.find((r) => r.id === catalog.id);
                const lifecycle =
                  live?.lifecycleStatus ?? catalog.lifecycleStatus;
                const relayCount = roomRelayBadge(catalog.id);
                return (
                  <Link
                    key={catalog.id}
                    to={`/chats/${catalog.id}`}
                    className="row row--clickable"
                    style={{ textDecoration: "none" }}
                  >
                    <div className="row__avatar-wrap">
                      <div className="row__avatar">
                        <RoomTopicIcon topicId={catalog.roomTopic} size={18} />
                      </div>
                      {relayCount > 0 ? (
                        <NotifyPin count={relayCount} variant="relay" />
                      ) : null}
                    </div>
                    <div className="row__main">
                      <div className="row__title">
                        {roomTopicLabel(catalog.roomTopic)}
                      </div>
                      <div className="row__sub">
                        {catalog.awaitingChainSync
                          ? "Syncing wallet — room enables near chain tip"
                          : lifecycle === "connected"
                            ? "Connected"
                            : isRelayEligibleStatus(lifecycle)
                              ? "Chain relay"
                              : `Status: ${lifecycle}`}
                      </div>
                    </div>
                    <ArrowRight
                      size={16}
                      style={{ color: "var(--text-faint)", flexShrink: 0 }}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="stack stack--gap-3 fade-in-up">
          <div className="card__title" style={{ paddingLeft: 4 }}>
            Payment identifiers
          </div>
          <PaymentIdField
            label="paymentIdFrom"
            direction="from"
            value={contact.paymentIdFrom}
            hint="You are the receiver for this ID: share it with your counterpart. You use it on receive to identify them (they store it as their paymentIdTo)."
            editable
            allowGenerate
            showQr
            qrKind="paymentId"
            onEdit={(v) => updateContact(contact.id, { paymentIdFrom: v })}
          />
          <PaymentIdField
            label="paymentIdTo"
            direction="to"
            value={contact.paymentIdTo ?? ""}
            missing={!contact.paymentIdTo}
            hint="That has been provided to you by your contact, so he/she can identify you. Use it when sending to them."
            editable
            showQr
            qrKind="paymentId"
            onEdit={(v) => savePaymentIdTo(contact.id, v)}
          />
        </div>

        {contact.notes && (
          <div className="card">
            <div className="card__title">Notes</div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{contact.notes}</p>
          </div>
        )}

        <div className="stack stack--gap-2 fade-in-up">
          {eligible ? (
            <>
              {showAccept && incomingInvite ? (
                <div className="card card--pad-md stack stack--gap-2">
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    {inviteAction === "accept"
                      ? "Sending accept on-chain, then opening the room. Holepunch connect continues in the room."
                      : inviteAction === "decline"
                        ? "Sending decline on-chain and revoking the pending room."
                        : acceptAwaitingSync
                          ? "Incoming chat invite — wallet still syncing. Accept unlocks near chain tip so any leave or revoke on the chain is visible first."
                          : contact.inviteStatus === "accepted" &&
                              contact.roomId !== incomingInvite.roomId
                            ? "New chat invite for another room. Accept to open it — your existing rooms with this contact stay open."
                            : "Incoming chat invite. Accept sends an on-chain register, then opens the room — live chat starts once peers connect."}
                  </div>
                  {queuedOthers.length > 0 && (
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {queuedOthers.length} other invite
                      {queuedOthers.length > 1 ? "s" : ""} waiting:{" "}
                      {queuedOthers
                        .map((i) => roomTopicLabel(i.roomTopic))
                        .join(", ")}
                      . Accept handles the newest (
                      {roomTopicLabel(incomingInvite.roomTopic)}) first.
                    </div>
                  )}
                  <div className="row-flex" style={{ gap: 8 }}>
                    <button
                      className="btn btn--primary grow"
                      disabled={inviteAction !== null || acceptAwaitingSync}
                      onClick={handleAccept}
                    >
                      {inviteAction === "accept" ? (
                        <>
                          <Loader2 size={16} className="spin" /> Accepting…
                        </>
                      ) : (
                        "Accept"
                      )}
                    </button>
                    <button
                      className="btn btn--secondary grow"
                      disabled={inviteAction !== null}
                      onClick={handleDecline}
                    >
                      {inviteAction === "decline" ? (
                        <>
                          <Loader2 size={16} className="spin" /> Declining…
                        </>
                      ) : (
                        "Decline"
                      )}
                    </button>
                  </div>
                </div>
              ) : refreshingInvite ? (
                <div
                  className="card card--pad-md center muted"
                  style={{ fontSize: 13.5 }}
                >
                  <Loader2 size={16} className="spin" /> Checking for invites…
                </div>
              ) : canInvite || canNewTopicRoom ? (
                <button
                  className="btn btn--block btn--primary"
                  onClick={() => setCreateSheet(true)}
                >
                  <MessageSquarePlus size={16} /> Create room
                </button>
              ) : contact.inviteStatus === "sent" || canResend ? (
                <div className="card card--pad-md center stack stack--gap-2">
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    {roomLive
                      ? "Chat session is live."
                      : contact.inviteStatus === "sent"
                        ? "Invite sent. You can open the pending room, or create another room (new room id) if needed."
                        : roomRelayActive
                          ? "Invite accepted — chatting via blockchain relay while Holepunch connects. Creating another room keeps this one open."
                          : "Invite was marked accepted but Holepunch is not connected. You can open this room or create another."}
                  </div>
                  {contact.roomId && (
                    <button
                      className="btn btn--sm btn--secondary"
                      onClick={handleOpenChat}
                    >
                      <ArrowRight size={14} />{" "}
                      {contact.inviteStatus === "sent"
                        ? "Open pending room"
                        : "Open room"}
                    </button>
                  )}
                  {canResend && (
                    <button
                      className="btn btn--sm btn--primary"
                      disabled={sendingInvite}
                      onClick={handleResendInvite}
                    >
                      <MessageSquarePlus size={14} /> Resend invite
                    </button>
                  )}
                </div>
              ) : contact.chatStatus === "active" ||
                contact.chatStatus === "connecting" ? (
                <div className="stack stack--gap-2">
                  <button
                    className="btn btn--block btn--primary"
                    onClick={handleOpenChat}
                  >
                    <ArrowRight size={16} />{" "}
                    {contact.chatStatus === "active"
                      ? "Open connected chat"
                      : "Open connecting room"}
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn--block btn--secondary"
                  onClick={handleOpenChat}
                >
                  <ArrowRight size={16} /> Open room
                </button>
              )}
            </>
          ) : (
            <div
              className="card card--pad-md"
              style={{ background: "var(--bg-elev-2)" }}
            >
              <div className="row-flex" style={{ gap: 10 }}>
                <Lock size={16} style={{ color: "var(--text-faint)" }} />
                <span className="muted" style={{ fontSize: 13.5 }}>
                  Complete the relationship (save paymentIdTo) to unlock chat
                  invites.
                </span>
              </div>
            </div>
          )}

          {error && <div className="field__error">{error}</div>}

          <div className="row-flex" style={{ gap: 8, marginTop: 8 }}>
            <button
              className="btn btn--secondary grow"
              onClick={() => archiveContact(contact.id)}
            >
              <Archive size={15} /> Archive
            </button>
            <button
              className="btn btn--secondary grow"
              onClick={() => setConfirmBlock(true)}
            >
              <Ban size={15} /> Block
            </button>
            <button
              className="btn btn--danger grow"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
        </div>
      </div>

      <Sheet
        open={createSheet}
        title="Create room"
        onClose={() => setCreateSheet(false)}
      >
        <div className="stack stack--gap-3">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
            }}
          >
            {ROOM_TOPICS.map((t) => {
              const selected = roomTopic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`btn btn--sm ${selected ? "btn--primary" : "btn--secondary"}`}
                  onClick={() => setRoomTopic(t.id)}
                  style={{ justifyContent: "flex-start", gap: 8 }}
                >
                  <RoomTopicIcon topicId={t.id} size={15} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <label className="stack stack--gap-1">
            <span className="eyebrow">Invite expiry (hours)</span>
            <input
              type="number"
              min={1}
              max={168}
              value={inviteExpiryHours}
              onChange={(e) =>
                setInviteExpiryHours(Number(e.target.value) || 24)
              }
            />
          </label>
          <label className="stack stack--gap-1">
            <span className="eyebrow">Room TTL (days)</span>
            <input
              type="number"
              min={1}
              max={365}
              value={roomTtlDays}
              onChange={(e) => setRoomTtlDays(Number(e.target.value) || 7)}
            />
          </label>
          {error && <div className="field__error">{error}</div>}
          <button
            className="btn btn--block btn--primary"
            disabled={sendingInvite}
            onClick={handleInvite}
          >
            {sendingInvite ? (
              <>
                <Loader2 size={16} className="spin" /> Creating…
              </>
            ) : (
              <>
                <MessageSquarePlus size={16} /> Send invite
              </>
            )}
          </button>
          {sendingInvite && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Building on-chain invite…
            </p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={shareSheet}
        title="Share your identity"
        onClose={() => setShareSheet(false)}
      >
        <div className="stack stack--gap-3">
          <p className="muted" style={{ fontSize: 13.5 }}>
            Send these out of band (in person, via a secure channel). Share your
            paymentIdFrom — you use it to identify them on receive; they store
            it as their paymentIdTo. They give you a paymentIdTo so that when
            you send to them, they can identify you.
          </p>
          <ShareRow
            label="Your CCX address"
            value={contact.ccxAddress}
            qrKind="address"
          />
          <ShareRow
            label="paymentIdFrom"
            value={contact.paymentIdFrom}
            qrKind="paymentId"
          />
        </div>
      </Sheet>

      <ConfirmModal
        open={confirmDelete}
        title="Delete contact?"
        body="This removes the relationship mapping and any local chat room reference. On-chain history is unaffected."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => {
          removeContact(contact.id);
          navigate("/contacts");
        }}
        onClose={() => setConfirmDelete(false)}
      />
      <ConfirmModal
        open={confirmBlock}
        title="Block this contact?"
        body="They will appear as blocked and chat invites will be disabled. You can unblock from the same screen later."
        confirmLabel="Block"
        destructive
        onConfirm={() => blockContact(contact.id)}
        onClose={() => setConfirmBlock(false)}
      />
      <ConfirmModal
        open={confirmSameTopic}
        title="Create another room?"
        body="You already have an open room with the same topic. Are you sure you want to create a new one?"
        confirmLabel="Create new room"
        onConfirm={() => void submitInvite()}
        onClose={() => setConfirmSameTopic(false)}
      />
    </div>
  );
}

function ShareRow({
  label,
  value,
  qrKind,
}: {
  label: string;
  value: string;
  qrKind: "address" | "paymentId";
}) {
  const [copied, copy] = useCopy();
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <div className="card card--pad-md">
      <div className="row-flex row-flex--between" style={{ marginBottom: 6 }}>
        <div className="eyebrow">{label}</div>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          aria-expanded={qrOpen}
          aria-label={qrOpen ? "Hide QR code" : "Show QR code"}
          onClick={() => setQrOpen((o) => !o)}
        >
          {qrOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {qrOpen && (
        <div className="center" style={{ marginBottom: 12 }}>
          <WalletQrCode value={value} kind={qrKind} />
        </div>
      )}
      <div className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>
        {value}
      </div>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        style={{ marginTop: 10 }}
        onClick={() => copy(value)}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}{" "}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
