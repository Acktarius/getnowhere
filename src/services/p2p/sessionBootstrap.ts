/**
 * SessionBootstrapService — derive session + HolepunchBootstrapContract.
 */

import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { getRelationshipTopicEpoch } from "@/services/p2p/relationshipTopicEpochStore";
import { applyRelationshipTopicEpoch } from "@/services/p2p/topicEpochContactSync";
import type {
  ChatInviteHandshake,
  HolepunchBootstrapContract,
  TopicSuiteId,
} from "@/types/protocol";
import {
  HOLEPUNCH_CONTRACT_VERSION,
  resolveTopicSuite,
} from "@/types/protocol";
import type { SessionBootstrapService } from "@/types/services";

/** Invite wire epoch wins for this session; legacy packs fall back to local store. */
function resolveSessionTopicEpoch(
  handshake: ChatInviteHandshake,
  topicSuite: TopicSuiteId,
): number {
  if (topicSuite !== "HKDF_EPOCH_V1") {
    return handshake.topicEpoch ?? 0;
  }
  return handshake.topicEpoch !== undefined
    ? handshake.topicEpoch
    : getRelationshipTopicEpoch(handshake.relationshipId);
}

export const SessionBootstrapAdapter: SessionBootstrapService = {
  async deriveSession({ invite, acceptance, peerRole, localPrivateKeyRef }) {
    if (!acceptance.receiverEphemeralPublicKey) {
      throw new Error("register payload missing receiverEphemeralPublicKey.");
    }
    if (acceptance.inviteId !== invite.inviteId) {
      throw new Error("inviteId mismatch on register.");
    }
    if (acceptance.replayId !== invite.replayId) {
      throw new Error("replayId mismatch on register.");
    }
    if (!localPrivateKeyRef) {
      throw new Error("localPrivateKeyRef required to derive session.");
    }

    const completed = {
      ...invite,
      receiverEphemeralPublicKey: acceptance.receiverEphemeralPublicKey,
    };

    const topicSuite = resolveTopicSuite(completed);
    const topicEpoch = resolveSessionTopicEpoch(completed, topicSuite);
    if (topicSuite === "HKDF_EPOCH_V1") {
      await applyRelationshipTopicEpoch(completed.relationshipId, topicEpoch);
    }

    return P2PEncryptionAdapter.deriveSessionConfig({
      senderEphemeralPublicKey: completed.senderEphemeralPublicKey,
      receiverEphemeralPublicKey: completed.receiverEphemeralPublicKey!,
      localPrivateKeyRef,
      localIsSender: peerRole === "initiator",
      salt: completed.salt,
      info: {
        protocolVersion: completed.protocolVersion,
        cipherSuite: completed.cipherSuite,
        relationshipId: completed.relationshipId,
        roomId: completed.roomId,
      },
      nonceSeed: completed.nonceSeed,
      topicSuite,
      topicEpoch,
    });
  },

  async buildHolepunchContract({ session, invite, peerRole, relayHints }) {
    const topicSuite: TopicSuiteId = session.topicSuite;
    const topicEpoch = session.topicEpoch;
    const contract: HolepunchBootstrapContract = {
      contractVersion: HOLEPUNCH_CONTRACT_VERSION,
      roomId: session.roomId,
      relationshipId: session.relationshipId,
      inviteId: invite.inviteId,
      sessionId: session.sessionId,
      cipherSuite: session.cipherSuite,
      sendKeyRef: session.sendKeyRef,
      recvKeyRef: session.recvKeyRef,
      nonceSeed: session.nonceSeed,
      nonceStrategy: session.nonceStrategy,
      sendCounter: session.sendCounter,
      recvCounter: session.recvCounter,
      peerRole,
      transport: {
        kind: "holepunch",
        topicRef: session.topicRef,
        topicSuite,
        topicEpoch,
        relayHints,
      },
      roomTtl: invite.roomTtl,
      establishedAt: new Date().toISOString(),
    };
    return contract;
  },

  async bootstrapFromSession(session) {
    return {
      roomId: session.roomId,
      roomKeyRef: session.sessionId,
      bootstrapSource: "conceal-smart-message" as const,
      lifecycleStatus: "accepted" as const,
    };
  },
};
