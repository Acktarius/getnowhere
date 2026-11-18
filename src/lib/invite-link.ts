/**
 * One-time relationship invite link. One payment ID, one person.
 * @see docs/features/invitations.md
 */
import { paymentIdIsValid } from "@/lib/parse-scanned-payload";
import { validateCcxAddress } from "@/services/conceal/ConcealWalletAdapter";
import type { Contact } from "@/types/models";

export const ONE_PERSON_LINK_WARNING =
  "Send this link to one person only. A second person would share this payment ID, and you could not tell their payments apart. The first reply you open is the one that counts.";

export const REPLY_TIMING_NOTICE =
  "You can create a room with them now. It only works once they open the reply link you are sending, so give them a few minutes.";

export function alreadySavedMessage(alias: string): string {
  return `${alias} is already in your contacts.`;
}

export function rememberedAliasMessage(knownAs: string, alias: string): string {
  return `Saved ${knownAs} as another name for ${alias}.`;
}

export function secondContactMessage(
  existingAlias: string,
  linkName: string,
): string {
  const same =
    existingAlias.trim().toLowerCase() === linkName.trim().toLowerCase();
  const lead = same
    ? `You already have ${existingAlias} at this address, with a different payment ID.`
    : `This link calls them ${linkName}. You already have ${existingAlias} at this address, with a different payment ID.`;
  return `${lead} Add a second contact?`;
}

export type InviteLinkKind = "request" | "reply";

export type InviteLinkFrame = {
  v: 1;
  t: "gnh-invite";
  k: InviteLinkKind;
  /** Display name the other side should see. */
  n: string;
  /** Sender CCX address. */
  a: string;
  /** Sender paymentIdFrom. The receiver stores it as paymentIdTo. */
  p: string;
  /** 128-bit token. Echoed on the reply. */
  id: string;
};

export type InvitePasteError =
  | "malformed"
  | "version"
  | "self"
  | "used"
  | "cancelled"
  | "no-match"
  | "lost"
  | "handle"
  | "pid-in-use";

export const INVITE_PASTE_MESSAGE: Record<InvitePasteError, string> = {
  malformed: "This is not an invite link.",
  version: "This invite link is from a newer app.",
  self: "This invite link is yours.",
  used: "This link was already used. Create a new link for each person.",
  cancelled: "This invite was cancelled.",
  "no-match": "No unused invite matches this reply.",
  lost: "This link was already used. Only the first reply counts.",
  handle: "Enter the name they should use for you.",
  "pid-in-use": "Payment ID already in use.",
};

const TOKEN_RE = /^[0-9a-f]{32}$/;

export function newInviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function linkBlocksEligibility(
  state: Contact["linkState"] | undefined,
): boolean {
  return state === "unused" || state === "cancelled";
}

function cleanHandle(name: string): string | null {
  const n = name.trim();
  if (n.length < 1 || n.length > 64) return null;
  for (const ch of n) {
    if (ch.charCodeAt(0) < 32) return null;
  }
  return n;
}

export function encodeInviteLink(input: {
  kind: InviteLinkKind;
  handle: string;
  address: string;
  paymentIdFrom: string;
  token: string;
}): string {
  const n = cleanHandle(input.handle);
  const a = input.address.trim();
  const p = input.paymentIdFrom.trim().toLowerCase();
  const id = input.token.trim().toLowerCase();
  if (!n) throw new Error(INVITE_PASTE_MESSAGE.handle);
  if (!validateCcxAddress(a)) throw new Error("Invalid Conceal address.");
  if (!paymentIdIsValid(p)) throw new Error("Invalid payment ID.");
  if (!TOKEN_RE.test(id)) throw new Error("Invalid invite token.");
  const body: InviteLinkFrame = {
    v: 1,
    t: "gnh-invite",
    k: input.kind,
    n,
    a,
    p,
    id,
  };
  return JSON.stringify(body);
}

export function parseInviteLink(
  raw: string,
):
  | { ok: true; frame: InviteLinkFrame }
  | { ok: false; code: InvitePasteError } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return { ok: false, code: "malformed" };
  try {
    const parsed = JSON.parse(trimmed) as Partial<InviteLinkFrame>;
    if (parsed.t !== "gnh-invite") return { ok: false, code: "malformed" };
    if (parsed.v !== 1) return { ok: false, code: "version" };
    if (parsed.k !== "request" && parsed.k !== "reply") {
      return { ok: false, code: "malformed" };
    }
    const n = typeof parsed.n === "string" ? cleanHandle(parsed.n) : null;
    const a = typeof parsed.a === "string" ? parsed.a.trim() : "";
    const p = typeof parsed.p === "string" ? parsed.p.trim().toLowerCase() : "";
    const id =
      typeof parsed.id === "string" ? parsed.id.trim().toLowerCase() : "";
    if (
      !n ||
      !validateCcxAddress(a) ||
      !paymentIdIsValid(p) ||
      !TOKEN_RE.test(id)
    ) {
      return { ok: false, code: "malformed" };
    }
    return {
      ok: true,
      frame: { v: 1, t: "gnh-invite", k: parsed.k, n, a, p, id },
    };
  } catch {
    return { ok: false, code: "malformed" };
  }
}

export type InvitePasteOutcome =
  | { type: "need-handle"; frame: InviteLinkFrame }
  | {
      type: "show-existing";
      contactId: string;
      replyLink: string;
    }
  | {
      type: "create-redeemer";
      contactId?: string;
      replyLink: string;
      draft: Pick<
        Contact,
        | "alias"
        | "ccxAddress"
        | "paymentIdFrom"
        | "paymentIdTo"
        | "linkToken"
        | "linkRole"
        | "linkState"
        | "linkHandle"
      >;
    }
  | {
      type: "finalize";
      contactId: string;
      patch: Pick<
        Contact,
        "alias" | "ccxAddress" | "paymentIdTo" | "linkState"
      >;
    }
  | { type: "noop"; contactId: string }
  | { type: "already"; alias: string }
  | {
      type: "remember-alias";
      contactId: string;
      alias: string;
      alsoKnownAs: string;
    }
  | { type: "confirm-second"; alias: string; linkName: string }
  | { type: "error"; code: InvitePasteError };

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function contactHasPaymentId(contact: Contact, paymentId: string): boolean {
  const needle = paymentId.trim().toLowerCase();
  return (
    contact.paymentIdFrom.trim().toLowerCase() === needle ||
    (contact.paymentIdTo ?? "").trim().toLowerCase() === needle
  );
}

/** Match a pasted address and payment ID against contacts. No writes. */
function identityOutcome(
  frame: InviteLinkFrame,
  contacts: Contact[],
  ignoreIds: string[],
  confirmSecond: boolean | undefined,
): InvitePasteOutcome | null {
  const ignore = new Set(ignoreIds);
  const others = contacts.filter((c) => !ignore.has(c.id));
  const owner = others.find((c) => contactHasPaymentId(c, frame.p));
  if (owner) {
    if (owner.ccxAddress.trim() !== frame.a) {
      return { type: "error", code: "pid-in-use" };
    }
    const known =
      sameLabel(owner.alias, frame.n) ||
      (owner.alsoKnownAs ? sameLabel(owner.alsoKnownAs, frame.n) : false);
    if (known) return { type: "already", alias: owner.alias };
    return {
      type: "remember-alias",
      contactId: owner.id,
      alias: owner.alias,
      alsoKnownAs: frame.n,
    };
  }
  const byAddress = others.find(
    (c) => c.ccxAddress.trim() !== "" && c.ccxAddress.trim() === frame.a,
  );
  if (byAddress && !confirmSecond) {
    return {
      type: "confirm-second",
      alias: byAddress.alias,
      linkName: frame.n,
    };
  }
  return null;
}

/** Decide what a pasted link does. Does not write contacts. */
export function interpretInvitePaste(input: {
  raw: string;
  myAddress: string;
  contacts: Contact[];
  replyHandle?: string;
  replyPaymentIdFrom?: string;
  /** User confirmed a second contact at an address they already have. */
  confirmSecond?: boolean;
}): InvitePasteOutcome {
  const parsed = parseInviteLink(input.raw);
  if (!parsed.ok) return { type: "error", code: parsed.code };
  const frame = parsed.frame;
  if (frame.a === input.myAddress.trim()) {
    return { type: "error", code: "self" };
  }

  if (frame.k === "reply") {
    const issuer = input.contacts.find(
      (c) => c.linkRole === "issuer" && c.linkToken === frame.id,
    );
    if (!issuer) return { type: "error", code: "no-match" };
    if (issuer.linkState === "cancelled") {
      return { type: "error", code: "cancelled" };
    }
    if (issuer.linkState === "used") {
      const same =
        issuer.ccxAddress === frame.a &&
        (issuer.paymentIdTo ?? "").toLowerCase() === frame.p;
      return same
        ? { type: "noop", contactId: issuer.id }
        : { type: "error", code: "lost" };
    }
    const replyIdentity = identityOutcome(
      frame,
      input.contacts,
      [issuer.id],
      input.confirmSecond,
    );
    if (replyIdentity) return replyIdentity;
    return {
      type: "finalize",
      contactId: issuer.id,
      patch: {
        alias: frame.n,
        ccxAddress: frame.a,
        paymentIdTo: frame.p,
        linkState: "used",
      },
    };
  }

  const existing = input.contacts.find(
    (c) => c.linkRole === "redeemer" && c.linkToken === frame.id,
  );
  if (existing?.linkHandle && existing.paymentIdFrom) {
    return {
      type: "show-existing",
      contactId: existing.id,
      replyLink: encodeInviteLink({
        kind: "reply",
        handle: existing.linkHandle,
        address: input.myAddress,
        paymentIdFrom: existing.paymentIdFrom,
        token: frame.id,
      }),
    };
  }

  const requestIdentity = identityOutcome(
    frame,
    input.contacts,
    [],
    input.confirmSecond,
  );
  if (requestIdentity) return requestIdentity;

  const handle = input.replyHandle ? cleanHandle(input.replyHandle) : null;
  if (!handle) return { type: "need-handle", frame };
  const paymentIdFrom = input.replyPaymentIdFrom?.trim().toLowerCase() ?? "";
  if (!paymentIdIsValid(paymentIdFrom)) {
    return { type: "error", code: "malformed" };
  }
  return {
    type: "create-redeemer",
    replyLink: encodeInviteLink({
      kind: "reply",
      handle,
      address: input.myAddress,
      paymentIdFrom,
      token: frame.id,
    }),
    draft: {
      alias: frame.n,
      ccxAddress: frame.a,
      paymentIdFrom,
      paymentIdTo: frame.p,
      linkToken: frame.id,
      linkRole: "redeemer",
      linkState: "awaiting",
      linkHandle: handle,
    },
  };
}
