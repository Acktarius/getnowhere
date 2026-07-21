import {
  Archive,
  ArrowRight,
  Ban,
  Check,
  Copy,
  Loader2,
  Lock,
  MessageSquarePlus,
  Share2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import { PaymentIdField } from "@/components/PaymentIdField";
import { RelationshipStateCard } from "@/components/RelationshipStateCard";
import { ConfirmModal, Sheet } from "@/components/Sheet";
import {
  ChatStatusPill,
  InviteStatusPill,
  RelationshipStatusBadge,
} from "@/components/StatusBadges";
import { BackLink, TopBar } from "@/components/TopBar";
import { useCopy } from "@/hooks/useCopy";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { shortAddress, timeAgo } from "@/utils/format";

export function ContactDetailScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const contact = useContactsStore((s) => s.getById(id));
  const savePaymentIdTo = useContactsStore((s) => s.savePaymentIdTo);
  const updateContact = useContactsStore((s) => s.updateContact);
  const removeContact = useContactsStore((s) => s.removeContact);
  const archiveContact = useContactsStore((s) => s.archiveContact);
  const blockContact = useContactsStore((s) => s.blockContact);
  const sendInvite = useContactsStore((s) => s.sendInvite);
  const bootstrapRoom = useChatStore((s) => s.bootstrapRoom);

  const [copiedAddr, copyAddr] = useCopy();
  const [copiedFrom, copyFrom] = useCopy();
  const [sendingInvite, setSendingInvite] = useState(false);
  const [shareSheet, setShareSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const established = contact.relationshipStatus === "established";
  const canInvite =
    established &&
    contact.inviteStatus !== "sent" &&
    contact.inviteStatus !== "accepted";

  async function handleInvite() {
    if (!contact) return;
    setError(null);
    setSendingInvite(true);
    try {
      await sendInvite(contact.id, contact.alias);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleOpenChat() {
    if (!contact) return;
    // bootstrap a local-mock room keyed off the contact; real adapter would
    // use the invite's bootstrap data.
    const room = await bootstrapRoom(contact.id, {
      roomId: `room_${contact.id.slice(2)}`,
      roomKeyRef: `rk_${contact.id.slice(-12)}`,
      bootstrapSource: "local-mock",
    });
    navigate(`/chats/${room.id}`);
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
            label="paymentIdFrom (yours)"
            direction="from"
            value={contact.paymentIdFrom}
            hint="Share this with your counterpart. They will use it to recognize you."
            editable
            onEdit={(v) => updateContact(contact.id, { paymentIdFrom: v })}
          />
          <PaymentIdField
            label="paymentIdTo (theirs)"
            direction="to"
            value={contact.paymentIdTo ?? ""}
            missing={!contact.paymentIdTo}
            hint="Paste the identifier your counterpart gave you. The relationship becomes established once this is saved."
            editable
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
          {established ? (
            <>
              {canInvite ? (
                <button
                  className="btn btn--block btn--primary"
                  disabled={sendingInvite}
                  onClick={handleInvite}
                >
                  {sendingInvite ? (
                    <>
                      <Loader2 size={16} className="spin" /> Sending invite…
                    </>
                  ) : (
                    <>
                      <MessageSquarePlus size={16} /> Send P2P chat invite
                    </>
                  )}
                </button>
              ) : contact.inviteStatus === "sent" ? (
                <div className="card card--pad-md center stack stack--gap-2">
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    Invite sent via Conceal smart message. Waiting for
                    counterpart to accept.
                  </div>
                  <button
                    className="btn btn--sm btn--secondary"
                    onClick={handleOpenChat}
                  >
                    <ArrowRight size={14} /> Open room anyway
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn--block btn--primary"
                  onClick={handleOpenChat}
                >
                  <ArrowRight size={16} /> Open chat room
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
        open={shareSheet}
        title="Share your identity"
        onClose={() => setShareSheet(false)}
      >
        <div className="stack stack--gap-3">
          <p className="muted" style={{ fontSize: 13.5 }}>
            Send these out of band (in person, via a secure channel) so your
            counterpart can add you. The relationship only completes when they
            send back their paymentIdTo.
          </p>
          <ShareRow label="Your CCX address" value={contact.ccxAddress} />
          <ShareRow label="Your paymentIdFrom" value={contact.paymentIdFrom} />
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

function ShareRow({ label, value }: { label: string; value: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className="card card--pad-md">
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>
        {value}
      </div>
      <button
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
