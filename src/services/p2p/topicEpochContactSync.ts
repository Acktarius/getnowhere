/**
 * Mirror relationship topicEpoch into contacts + wallet addressBook.
 * @see docs/security/capabilities-and-derivation.md
 */

import {
  getRelationshipTopicEpoch,
  setRelationshipTopicEpoch,
  syncRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import { deriveRelationshipId, normalizeHexId } from "@/services/protocol/ids";
import type { Contact } from "@/types/models";

async function mirrorTopicEpochToContact(
  relationshipId: string,
  epoch: number,
  contactId?: string,
): Promise<void> {
  const { useContactsStore } = await import("@/state/contactsStore");
  const store = useContactsStore.getState();
  const rel = normalizeHexId(relationshipId);
  let targetId = contactId;
  if (!targetId) {
    for (const c of store.contacts) {
      if (!c.paymentIdFrom || !c.paymentIdTo) continue;
      const derived = await deriveRelationshipId(
        c.paymentIdFrom,
        c.paymentIdTo,
      );
      if (normalizeHexId(derived) === rel) {
        targetId = c.id;
        break;
      }
    }
  }
  if (!targetId) return;
  const contact = store.contacts.find((c) => c.id === targetId);
  if (!contact || contact.topicEpoch === epoch) return;
  store.updateContact(targetId, { topicEpoch: epoch });
}

/** Set epoch for this relationship and mirror onto the matching contact row. */
export async function applyRelationshipTopicEpoch(
  relationshipId: string,
  epoch: number,
  contactId?: string,
): Promise<void> {
  setRelationshipTopicEpoch(relationshipId, epoch);
  await mirrorTopicEpochToContact(relationshipId, epoch, contactId);
}

/** Monotonic max from peer revoke, then mirror. */
export async function syncAndMirrorRelationshipTopicEpoch(
  relationshipId: string,
  peerEpoch: number,
  contactId?: string,
): Promise<void> {
  syncRelationshipTopicEpoch(relationshipId, peerEpoch);
  await mirrorTopicEpochToContact(
    relationshipId,
    getRelationshipTopicEpoch(relationshipId),
    contactId,
  );
}

/** Bump after local leave/revoke and mirror. */
export async function bumpAndMirrorRelationshipTopicEpoch(
  relationshipId: string,
  contactId?: string,
): Promise<number> {
  const next = getRelationshipTopicEpoch(relationshipId) + 1;
  await applyRelationshipTopicEpoch(relationshipId, next, contactId);
  return next;
}

/** Restore local epoch map from wallet/local contacts after unlock or import. */
export async function seedTopicEpochStoreFromContacts(
  contacts: Contact[],
): Promise<void> {
  for (const c of contacts) {
    if (c.topicEpoch === undefined || !c.paymentIdFrom || !c.paymentIdTo) {
      continue;
    }
    const rel = await deriveRelationshipId(c.paymentIdFrom, c.paymentIdTo);
    syncRelationshipTopicEpoch(rel, c.topicEpoch);
  }
}
