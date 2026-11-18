import { useState } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Sheet } from "@/components/Sheet";
import { copySensitive } from "@/lib/clipboard/sensitiveClipboard";
import {
  encodeInviteLink,
  INVITE_PASTE_MESSAGE,
  type InvitePasteOutcome,
  ONE_PERSON_LINK_WARNING,
  REPLY_TIMING_NOTICE,
} from "@/lib/invite-link";
import { useContactsStore } from "@/state/contactsStore";
import type { Contact } from "@/types/models";

function shortPid(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 5)}…${value.slice(-5)}`;
}

export function CreateInviteLinkSheet({
  open,
  myAddress,
  anchorTop,
  onClose,
}: {
  open: boolean;
  myAddress: string;
  anchorTop?: number;
  onClose: () => void;
}) {
  const createInviteLink = useContactsStore((s) => s.createInviteLink);
  const [handle, setHandle] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setHandle("");
    setLink(null);
    setError(null);
    setBusy(false);
    onClose();
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await createInviteLink({ handle, myAddress });
      await copySensitive(created.link);
      setLink(created.link);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Create invite link"
      anchorTop={anchorTop}
      onClose={close}
    >
      <div className="stack stack--gap-3">
        <div
          className="card card--pad-md"
          style={{
            borderColor: "var(--warning)",
            background: "color-mix(in srgb, var(--warning) 12%, transparent)",
          }}
        >
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>
            {ONE_PERSON_LINK_WARNING}
          </p>
        </div>
        {link ? (
          <>
            <p className="muted" style={{ fontSize: 13.5 }}>
              Link copied. Send it to that one person, then you can leave. An
              unused invite is now in your list.
            </p>
            <button
              type="button"
              className="btn btn--block btn--primary"
              onClick={close}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <span className="field__label">Name they will see</span>
              <input
                className="input"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="e.g. Ada"
                autoFocus
              />
              <span className="field__hint">
                This is how you want them to name you. It is not the name you
                will use for them.
              </span>
            </div>
            {error && <div className="field__error">{error}</div>}
            <button
              type="button"
              className="btn btn--block btn--primary"
              disabled={busy || handle.trim().length === 0 || !myAddress}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create and copy"}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function PasteInviteLinkSheet({
  open,
  myAddress,
  anchorTop,
  onClose,
}: {
  open: boolean;
  myAddress: string;
  anchorTop?: number;
  onClose: () => void;
}) {
  const pasteInviteLink = useContactsStore((s) => s.pasteInviteLink);
  const [raw, setRaw] = useState("");
  const [handle, setHandle] = useState("");
  const [askingHandle, setAskingHandle] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [replyLink, setReplyLink] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  function close() {
    setRaw("");
    setHandle("");
    setWarningOpen(false);
    setAskingHandle(false);
    setPreview(null);
    setReplyLink(null);
    setDone(null);
    setError(null);
    setBusy(false);
    onClose();
  }

  function showOutcome(outcome: InvitePasteOutcome) {
    if (outcome.type === "need-handle") {
      setAskingHandle(true);
      setPreview(
        `${outcome.frame.n}\n${outcome.frame.a}\n${shortPid(outcome.frame.p)}`,
      );
      setError(null);
      return;
    }
    if (outcome.type === "error") {
      setError(INVITE_PASTE_MESSAGE[outcome.code]);
      return;
    }
    if (
      outcome.type === "create-redeemer" ||
      outcome.type === "show-existing"
    ) {
      setReplyLink(outcome.replyLink);
      setAskingHandle(false);
      setError(null);
      return;
    }
    if (outcome.type === "finalize") {
      setDone(`${outcome.patch.alias} is saved. You can send to them.`);
      setError(null);
      return;
    }
    if (outcome.type === "noop") {
      setDone("This reply was already saved.");
      setError(null);
    }
  }

  async function submit(withHandle?: string) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await pasteInviteLink({
        raw,
        myAddress,
        replyHandle: withHandle,
      });
      if (
        outcome.type === "create-redeemer" ||
        outcome.type === "show-existing"
      ) {
        await copySensitive(outcome.replyLink);
      }
      showOutcome(outcome);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        title="Paste invite link"
        anchorTop={anchorTop}
        onClose={close}
      >
        <div className="stack stack--gap-3">
          {replyLink ? (
            <>
              <p className="muted" style={{ fontSize: 13.5 }}>
                Reply link copied. Send it back to that one person.
              </p>
              <button
                type="button"
                className="btn btn--block btn--primary"
                onClick={() => void copySensitive(replyLink)}
              >
                Copy reply link
              </button>
              <button
                type="button"
                className="btn btn--block btn--secondary"
                onClick={() => setWarningOpen(true)}
              >
                Done
              </button>
            </>
          ) : done ? (
            <>
              <p style={{ fontSize: 14 }}>{done}</p>
              <button
                type="button"
                className="btn btn--block btn--primary"
                onClick={close}
              >
                Done
              </button>
            </>
          ) : askingHandle ? (
            <>
              <pre
                className="mono"
                style={{ fontSize: 12.5, whiteSpace: "pre-wrap", margin: 0 }}
              >
                {preview}
              </pre>
              <div className="field">
                <span className="field__label">
                  Name they should use for you
                </span>
                <input
                  className="input"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="e.g. Ada"
                  autoFocus
                />
              </div>
              {error && <div className="field__error">{error}</div>}
              <button
                type="button"
                className="btn btn--block btn--primary"
                disabled={busy || handle.trim().length === 0}
                onClick={() => void submit(handle)}
              >
                {busy ? "Saving…" : "Create reply link"}
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <span className="field__label">Invite link</span>
                <textarea
                  className="textarea"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder="Paste the link from email or chat"
                  autoFocus
                />
              </div>
              {error && <div className="field__error">{error}</div>}
              <button
                type="button"
                className="btn btn--block btn--primary"
                disabled={busy || raw.trim().length === 0}
                onClick={() => void submit()}
              >
                {busy ? "Checking…" : "Open link"}
              </button>
            </>
          )}
        </div>
      </Sheet>
      <ConfirmModal
        open={open && warningOpen}
        onClose={() => setWarningOpen(false)}
        title="Give them a few minutes"
        body={REPLY_TIMING_NOTICE}
        confirmLabel="Got it"
        cancelLabel="Back"
        onConfirm={close}
      />
    </>
  );
}

/** Copy or cancel an invite you created, from the contact page. */
export function InviteLinkContactNote({
  contact,
  myAddress,
}: {
  contact: Contact;
  myAddress: string;
}) {
  const cancelInviteLink = useContactsStore((s) => s.cancelInviteLink);
  if (contact.linkRole !== "issuer" || contact.linkState !== "unused") {
    return null;
  }
  const canCopy = Boolean(
    myAddress &&
      contact.linkHandle &&
      contact.linkToken &&
      contact.paymentIdFrom,
  );
  return (
    <div className="card card--pad-md stack stack--gap-2">
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>
        {ONE_PERSON_LINK_WARNING}
      </p>
      <div className="row-flex" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn--sm btn--secondary"
          disabled={!canCopy}
          onClick={() => {
            if (!canCopy || !contact.linkHandle || !contact.linkToken) return;
            const link = encodeInviteLink({
              kind: "request",
              handle: contact.linkHandle,
              address: myAddress,
              paymentIdFrom: contact.paymentIdFrom,
              token: contact.linkToken,
            });
            void copySensitive(link);
          }}
        >
          Copy link
        </button>
        <button
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => cancelInviteLink(contact.id)}
        >
          Cancel invite
        </button>
      </div>
    </div>
  );
}
