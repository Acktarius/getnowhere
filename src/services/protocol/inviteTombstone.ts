/**
 * Privacy-minimized invite tombstones — wipe live secrets, keep replay metadata.
 */

import type { SmartMessageInvite } from "@/types/models";
import type { InviteTombstone } from "@/types/protocol";

export function tombstoneInvite(
  invite: SmartMessageInvite,
  status: InviteTombstone["status"],
  nowIso = new Date().toISOString(),
): { tombstone: InviteTombstone; invite: SmartMessageInvite } {
  const tombstone: InviteTombstone = {
    inviteId: invite.inviteId,
    replayId: invite.replayId,
    roomId: invite.roomId,
    contactId: invite.contactId,
    status,
    inviteExpiry: invite.inviteExpiry,
    roomTtl: invite.roomTtl,
    tombstonedAt: nowIso,
  };

  // Older rows may still carry this plaintext key. @see docs/security/p2pchatprotocol.md §11
  const legacy = invite as SmartMessageInvite & {
    bootstrapEncrypted?: unknown;
  };
  const { bootstrapEncrypted: _legacyBootstrap, ...rest } = legacy;
  const wiped: SmartMessageInvite = {
    ...rest,
    status:
      status === "destroyed"
        ? "failed"
        : status === "rejected"
          ? "rejected"
          : status === "expired"
            ? "expired"
            : "failed",
    tombstonedAt: nowIso,
  };

  return { tombstone, invite: wiped };
}
