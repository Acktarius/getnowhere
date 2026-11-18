/**
 * One-time relationship invite link. One payment ID, one person.
 * @see docs/features/invitations.md
 */
import { paymentIdIsValid } from "@/lib/parse-scanned-payload";
import { validateCcxAddress } from "@/services/conceal/ConcealWalletAdapter";
import type { Contact } from "@/types/models";

export const ONE_PERSON_LINK_WARNING =
  "Send this link to one person only. A second person would share this payment ID, and you could not tell their payments apart. The first reply you open is the one that counts.";

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
  | "handle";

export const INVITE_PASTE_MESSAGE: Record<InvitePasteError, string> = {
  malformed: "This is not an invite link.",
  version: "This invite link is from a newer app.",
  self: "This invite link is yours.",
  used: "This link was already used. Create a new link for each person.",
  cancelled: "This invite was cancelled.",
  "no-match": "No unused invite matches this reply.",
  lost: "This link was already used. Only the first reply counts.",
  handle: "Enter the name they should use for you.",
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
  return state === "unused" || state === "awaiting" || state === "cancelled";
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
  | { type: "error"; code: InvitePasteError };

/** Decide what a pasted link does. Does not write contacts. */
export function interpretInvitePaste(input: {
  raw: string;
  myAddress: string;
  contacts: Contact[];
  replyHandle?: string;
  replyPaymentIdFrom?: string;
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
