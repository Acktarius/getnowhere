# Pairing and Topic Derivation

Get Now Here is not a public chat room model. It is a relationship-based,
invite-led, one-to-one connection model.

Wire-level invite and handshake details live in
`docs/security/p2pchatprotocol.md`. This page states the **only** networking
topic rule coding agents may implement.

## Rule

Never use a human-readable room name or globally guessable string as the raw
Hyperswarm topic.

Instead:

1. obtain opaque `roomId` + `relationshipId` from the invite/handshake path
2. derive a 32-byte topic (`topicRef` as 64 lowercase hex chars)
3. join that topic only in the P2P runtime (sidecar or Bare worklet)
4. run an application-level identity check after connection
5. only then unlock the chat session

## Canonical topic derivation (implemented)

**This is the only live formula.** Do not invent alternate prefixes or
`inviteSecret`-based topics in codegen unless `p2pchatprotocol.md` and
`src/services/protocol/ids.ts` are updated first in the same change.

```ts
// src/services/protocol/ids.ts — deriveTopicRef
topicRef = sha256Hex(`gnh-chat-v1||${roomId}||${relationshipId}`)
```

- Output: 64 hex characters = 32 bytes for `swarm.join(Buffer.from(topicRef, "hex"))`.
- `roomId` and `relationshipId` are opaque protocol identifiers, not display names.
- Never embed raw payment IDs, aliases, or human room titles in the topic string.
- Display topics (work/family/…) live in `handshake.roomTopic` / UI only — see
  `src/services/protocol/roomTopics.ts`.

## Multiple rooms per relationship

One eligible contact (pair of payment IDs) may have **many** chat rooms. Each
room has its own opaque `roomId` and therefore its own Hyperswarm `topicRef`.

Users pick a **display topic** from a fixed list (General, Work, Family,
Vacation, Friends). That label is UI metadata and a 1-byte index on the create
pack — it is **never** embedded in the DHT topic string.

Supersede / resend applies **per contact + roomTopic**, so a Work invite does
not expire a Family room.

## Post-connect verification

After the transport connection is established, the application must:

- exchange expected relationship or invite identifiers
- verify counterpart identity or proof-of-possession
- reject mismatched peers
- only then mark the session as active

## Invite transport

The invite is a bootstrap artifact (SmartMessage, QR, deep link, or out-of-band
share), not the chat transport. Live chat runs on Hyperswarm peer streams owned
by the runtime; the UI observes state through the bridge.
