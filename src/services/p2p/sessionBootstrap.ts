/**
 * SessionBootstrapService — derive session + HolepunchBootstrapContract.
 */

import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import {
  getRelationshipTopicEpoch,
  syncRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import type {
  HolepunchBootstrapContract,
  TopicSuiteId,
} from "@/types/protocol";
import {
  HOLEPUNCH_CONTRACT_VERSION,
  resolveTopicSuite,
} from "@/types/protocol";
import type { SessionBootstrapService } from "@/types/services";

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
    if (topicSuite === "HKDF_EPOCH_V1") {
      if (completed.topicEpoch !== undefined) {
        syncRelationshipTopicEpoch(
          completed.relationshipId,
          completed.topicEpoch,
        );
      }
    }
    const topicEpoch =
      topicSuite === "HKDF_EPOCH_V1"
        ? getRelationshipTopicEpoch(completed.relationshipId)
        : (completed.topicEpoch ?? 0);

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
