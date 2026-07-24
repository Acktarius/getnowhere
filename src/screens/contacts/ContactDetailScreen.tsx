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
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PaymentIdField } from "@/components/PaymentIdField";
import { WalletQrCode } from "@/components/qr/WalletQrCode";
import { RelationshipStateCard } from "@/components/RelationshipStateCard";
import {
  RoomTopicIcon,
} from "@/components/RoomTopicIcon";
import { ConfirmModal, Sheet } from "@/components/Sheet";
import {
  ChatStatusPill,
  InviteStatusPill,
  RelationshipStatusBadge,
} from "@/components/StatusBadges";
import { BackLink, TopBar } from "@/components/TopBar";
import { useCopy } from "@/hooks/useCopy";
import { ROOM_TOPICS } from "@/services/protocol/roomTopics";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
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
  const abandonPendingInvite = useContactsStore((s) => s.abandonPendingInvite);
  const invites = useContactsStore((s) => s.invites);
  const contactRoomId = useContactsStore((s) => s.getById(id)?.roomId);
  const bootstrapRoom = useChatStore((s) => s.bootstrapRoom);
  const roomLive = useChatStore((s) => {
    if (!contactRoomId) return false;
    const room = s.rooms.find((r) => r.id === contactRoomId);
    return (
      room?.lifecycleStatus === "connected" && room.peerStatus === "online"
    );
  });

  const [copiedAddr, copyAddr] = useCopy();
  const [copiedFrom, copyFrom] = useCopy();
  const [sendingInvite, setSendingInvite] = useState(false);
  const [createSheet, setCreateSheet] = useState(false);
  const [inviteExpiryHours, setInviteExpiryHours] = useState(24);
  const [roomTtlDays, setRoomTtlDays] = useState(7);
  const [roomTopic, setRoomTopic] = useState<
    import("@/services/protocol/roomTopics").RoomTopicId
  >("general");
  const [shareSheet, setShareSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [refreshingInvite, setRefreshingInvite] = useState(false);

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
  const incomingInvite = eligible
    ? [...invites]
        .filter((i) => i.contactId === contact.id && i.status === "received")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    : undefined;
  /** Newer create must show Accept even if an older invite was already accepted. */
  const showAccept = Boolean(
    incomingInvite &&
      (contact.inviteStatus === "received" ||
        contact.roomId !== incomingInvite.roomId),
  );
  const canInvite =
    eligible &&
    !showAccept &&
    contact.inviteStatus !== "received";
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

  async function handleResendInvite() {
    if (!contact) return;
    setError(null);
    setSendingInvite(true);
    try {
      await abandonPendingInvite(contact.id);
      setCreateSheet(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleInvite() {
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
    setActing(true);
    setError(null);
    try {
      const { roomId } = await acceptInvite(incomingInvite.id);
      navigate(`/chats/${roomId}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toastError(msg);
    } finally {
      setActing(false);
    }
  }

  async function handleDecline() {
    if (!incomingInvite) return;
    setActing(true);
    setError(null);
    try {
      await declineInvite(incomingInvite.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(false);
    }
  }

  async function handleOpenChat() {
    if (!contact) return;
    setError(null);
    setActing(true);
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
    } finally {
      setActing(false);
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
            <ChatStatusPill status={contact.chatStatus} />
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
                    {acting
                      ? "Sending accept on-chain, then opening the room. Holepunch connect continues in the room."
                      : contact.inviteStatus === "accepted" &&
                          contact.roomId !== incomingInvite.roomId
                        ? "New chat invite supersedes the old room. Accept to connect the new invite."
                        : "Incoming chat invite. Accept sends an on-chain register, then opens the room — live chat starts once peers connect."}
                  </div>
                  <div className="row-flex" style={{ gap: 8 }}>
                    <button
                      className="btn btn--primary grow"
                      disabled={acting}
                      onClick={handleAccept}
                    >
                      {acting ? (
                        <>
                          <Loader2 size={16} className="spin" /> Accepting…
                        </>
                      ) : (
                        "Accept"
                      )}
                    </button>
                    <button
                      className="btn btn--secondary grow"
                      disabled={acting}
                      onClick={handleDecline}
                    >
                      Decline
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
                        ? "Invite sent. If the pending room stays offline after they accept, resend a new invite (new room id)."
                        : "Invite was marked accepted but Holepunch is not connected. Resend a new invite to recover."}
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
                      onClick={() => void handleResendInvite()}
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
