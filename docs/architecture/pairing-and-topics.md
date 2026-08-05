# Pairing and Topic Derivation

Get NowHere is not a public chat room model. It is a relationship-based,
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

### Canonical hex inputs (mandatory)

`relationshipId` is **never on the wire** — each peer derives it locally from
its own contact record (`deriveRelationshipId(paymentIdFrom, paymentIdTo)`,
order-independent). Every hex id that feeds a derivation must therefore be
canonicalized with `normalizeHexId` (trim + lowercase) before hashing:

```ts
relationshipId = sha256Hex(`gnh-rel-v1|${lowerA}|${lowerB}`) // sorted pair
```

L1 delivery matching already compares payment IDs case-insensitively
(`matchContactByPaymentId`). Hashing unnormalized values therefore produced a
**silent split-brain**: the invite is delivered, accepted, and both sides show
the same `roomId`, yet a case difference in one stored payment ID yields a
different `relationshipId` → different `topicRef` → each peer announces on a
topic the other never looks up. The sidecar reports this as
`DHT candidates known: 0` with a healthy routing table
(`docs/architecture/holepunch-sidecar.md`).

Room diagnostics shows `Topic:` per room — compare it on both peers (and
against the sidecar's `topic <prefix>…` log) before suspecting NAT or firewall.

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
