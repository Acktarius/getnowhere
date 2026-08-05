/**
 * Persist Get NowHere contacts:
 * 1. App local storage (`gnh.contacts`) — survives refresh / lock.
 * 2. Wallet blob `addressBook` — rides encrypted wallet .json export/import.
 */
import type { RawAddressEntry, RawWalletV1 } from "conceal-wallet-sdk";
import {
  getRuntime,
  persistRuntime,
  requireRuntime,
} from "@/services/conceal/sync/runtime";
import { getStorage } from "@/services/storage/StorageAdapter";
import type { Contact, SmartMessageInvite } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";

const CONTACTS_KEY = "gnh.contacts";
const INVITES_KEY = "gnh.invites";
/** Initiator X25519 secrets + handshake until Alice scans Bob's register. */
const PENDING_INITIATOR_KEYS_KEY = "gnh.pendingInitiatorKeys";
/** Set once we have written or loaded contacts so demo-seed does not refill. */
const CONTACTS_READY_KEY = "gnh.contacts.ready";

/** Stashed on Alice after sendInvite / Bob after accept; wiped after session persist. */
export type PendingInitiatorRecord = {
  inviteId: string;
  contactId: string;
  roomId: string;
  privateKeyHex: string;
  handshake: ChatInviteHandshake;
  peerRole?: "initiator" | "responder";
  /** Bob's register payload — needed to re-derive after refresh. */
  register?: import("@/types/protocol").ChatRegisterPayload;
};

/** Extended address-book row stored in the wallet blob (SDK + GNH fields). */
export type StoredAddressEntry = RawAddressEntry & {
  paymentIdTo?: string;
  notes?: string;
  relationshipStatus?: Contact["relationshipStatus"];
  inviteStatus?: Contact["inviteStatus"];
  chatStatus?: Contact["chatStatus"];
  roomId?: string;
  createdAt?: string;
  updatedAt?: string;
  lastInteractionAt?: string;
};

function isContact(value: unknown): value is Contact {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Contact).id === "string" &&
    typeof (value as Contact).ccxAddress === "string" &&
    typeof (value as Contact).paymentIdFrom === "string"
  );
}

function isInvite(value: unknown): value is SmartMessageInvite {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SmartMessageInvite).id === "string" &&
    typeof (value as SmartMessageInvite).inviteId === "string"
  );
}

export function contactToAddressEntry(contact: Contact): StoredAddressEntry {
  return {
    id: contact.id,
    label: contact.alias,
    address: contact.ccxAddress,
    paymentId: contact.paymentIdFrom || undefined,
    paymentIdTo: contact.paymentIdTo,
    notes: contact.notes,
    relationshipStatus: contact.relationshipStatus,
    inviteStatus: contact.inviteStatus,
    chatStatus: contact.chatStatus,
    roomId: contact.roomId,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    lastInteractionAt: contact.lastInteractionAt,
  };
}

export function addressEntryToContact(entry: StoredAddressEntry): Contact {
  const now = new Date().toISOString();
  // Legacy: relationship "established" → "eligible"; chat "eligible" → "ready".
  const rawRel = String(entry.relationshipStatus ?? "pending");
  const relationshipStatus: Contact["relationshipStatus"] =
    rawRel === "established"
      ? "eligible"
      : rawRel === "eligible" ||
          rawRel === "blocked" ||
          rawRel === "archived" ||
          rawRel === "pending"
        ? rawRel
        : "pending";
  const rawChat = String(entry.chatStatus ?? "unavailable");
  const chatStatus: Contact["chatStatus"] =
    rawChat === "eligible"
      ? "ready"
      : rawChat === "ready" ||
          rawChat === "invited" ||
          rawChat === "connecting" ||
          rawChat === "active" ||
          rawChat === "unavailable"
        ? rawChat
        : "unavailable";
  return {
    id: entry.id,
    alias: entry.label?.trim() || "Contact",
    ccxAddress: entry.address,
    paymentIdFrom: entry.paymentId?.trim() || "",
    paymentIdTo: entry.paymentIdTo?.trim() || undefined,
    notes: entry.notes,
    relationshipStatus,
    inviteStatus: entry.inviteStatus ?? "none",
    chatStatus,
    roomId: entry.roomId,
    createdAt: entry.createdAt ?? now,
    updatedAt: entry.updatedAt ?? now,
    lastInteractionAt: entry.lastInteractionAt,
  };
}

export function readAddressBook(raw: RawWalletV1): StoredAddressEntry[] {
  const list = raw.addressBook;
  if (!Array.isArray(list)) return [];
  return list.filter((entry): entry is StoredAddressEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as StoredAddressEntry).id === "string" &&
      typeof (entry as StoredAddressEntry).address === "string"
    );
  });
}

export function withAddressBook(
  raw: RawWalletV1,
  entries: StoredAddressEntry[],
): RawWalletV1 {
  return { ...raw, addressBook: entries };
}

/** True when contacts have been loaded or saved at least once (skip demo seed). */
export function contactsPersistenceReady(): boolean {
  return getStorage().getItem(CONTACTS_READY_KEY) === "1";
}

function markReady(): void {
  getStorage().setItem(CONTACTS_READY_KEY, "1");
}

export function loadContactsFromLocal(): Contact[] {
  try {
    const raw = getStorage().getItem(CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isContact).map((c) => {
      // Migrate legacy status strings from disk.
      const relationshipStatus =
        (c.relationshipStatus as string) === "established"
          ? ("eligible" as const)
          : c.relationshipStatus;
      const chatStatus =
        (c.chatStatus as string) === "eligible"
          ? ("ready" as const)
          : c.chatStatus;
      return { ...c, relationshipStatus, chatStatus };
    });
  } catch {
    return [];
  }
}

export function loadInvitesFromLocal(): SmartMessageInvite[] {
  try {
    const raw = getStorage().getItem(INVITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInvite) : [];
  } catch {
    return [];
  }
}

export function saveContactsToLocal(contacts: Contact[]): void {
  getStorage().setItem(CONTACTS_KEY, JSON.stringify(contacts));
  markReady();
}

export function saveInvitesToLocal(invites: SmartMessageInvite[]): void {
  getStorage().setItem(INVITES_KEY, JSON.stringify(invites));
  markReady();
}

function isPendingInitiatorRecord(
  value: unknown,
): value is PendingInitiatorRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as PendingInitiatorRecord;
  return (
    typeof r.inviteId === "string" &&
    typeof r.contactId === "string" &&
    typeof r.roomId === "string" &&
    typeof r.privateKeyHex === "string" &&
    typeof r.handshake === "object" &&
    r.handshake !== null
  );
}

export function loadPendingInitiatorKeys(): PendingInitiatorRecord[] {
  try {
    const raw = getStorage().getItem(PENDING_INITIATOR_KEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPendingInitiatorRecord) : [];
  } catch {
    return [];
  }
}

export function savePendingInitiatorKeys(
  records: PendingInitiatorRecord[],
): void {
  getStorage().setItem(PENDING_INITIATOR_KEYS_KEY, JSON.stringify(records));
}

export function upsertPendingInitiatorKey(
  record: PendingInitiatorRecord,
): void {
  const next = loadPendingInitiatorKeys().filter(
    (r) => r.inviteId !== record.inviteId,
  );
  next.push(record);
  savePendingInitiatorKeys(next);
}

export function removePendingInitiatorKey(inviteId: string): void {
  savePendingInitiatorKeys(
    loadPendingInitiatorKeys().filter((r) => r.inviteId !== inviteId),
  );
}

/** Write contacts into the open wallet blob and persist encrypted storage. */
export async function saveContactsToWalletBlob(
  contacts: Contact[],
): Promise<void> {
  const rt = getRuntime();
  if (!rt) return;
  rt.raw = withAddressBook(rt.raw, contacts.map(contactToAddressEntry));
  await persistRuntime(rt);
}

/**
 * Persist contacts to local storage and (when unlocked) the wallet addressBook.
 */
export async function persistContacts(contacts: Contact[]): Promise<void> {
  saveContactsToLocal(contacts);
  try {
    await saveContactsToWalletBlob(contacts);
  } catch {
    // Local copy is enough until the next successful wallet persist.
  }
}

export function persistInvites(invites: SmartMessageInvite[]): void {
  saveInvitesToLocal(invites);
}

/**
 * Prefer wallet addressBook when open and non-empty; otherwise local storage.
 * Also mirrors the chosen source into the other store.
 */
export async function hydrateContacts(): Promise<{
  contacts: Contact[];
  invites: SmartMessageInvite[];
}> {
  const local = loadContactsFromLocal();
  const invites = loadInvitesFromLocal();
  const rt = getRuntime();

  if (rt) {
    const fromWallet = readAddressBook(rt.raw).map(addressEntryToContact);
    if (fromWallet.length > 0) {
      saveContactsToLocal(fromWallet);
      markReady();
      // Keep blob in sync if local had extras that wallet lacked — prefer wallet
      // as source of truth after import/unlock.
      return { contacts: fromWallet, invites };
    }
    if (local.length > 0) {
      // Migrate local → wallet blob (first unlock after app-only saves).
      try {
        await saveContactsToWalletBlob(local);
      } catch {
        /* non-fatal */
      }
    }
  }

  markReady();
  return { contacts: local, invites };
}

/** Snapshot contacts for metadata .json export (no secrets). */
export function contactsExportPayload(contacts: Contact[]): unknown[] {
  return contacts.map((c) => ({
    id: c.id,
    alias: c.alias,
    ccxAddress: c.ccxAddress,
    paymentIdFrom: c.paymentIdFrom,
    paymentIdTo: c.paymentIdTo ?? null,
    notes: c.notes ?? null,
    relationshipStatus: c.relationshipStatus,
    inviteStatus: c.inviteStatus,
    chatStatus: c.chatStatus,
    roomId: c.roomId ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

/** Ensure addressBook on a raw blob matches contacts (used before file export). */
export function applyContactsToRaw(
  raw: RawWalletV1,
  contacts: Contact[],
): RawWalletV1 {
  return withAddressBook(raw, contacts.map(contactToAddressEntry));
}

/** Sync current store contacts into an already-open runtime (no-op if locked). */
export async function flushContactsToOpenWallet(
  contacts: Contact[],
): Promise<void> {
  try {
    requireRuntime();
    await saveContactsToWalletBlob(contacts);
  } catch {
    /* wallet not open */
  }
}
