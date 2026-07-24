# Invitations Feature

This document defines **relationship** invitations for Get Now Here — how one
user initiates contact with another and establishes a bidirectional Conceal
relationship (`paymentIdFrom` / `paymentIdTo`).

**Chat invites are a separate protocol.** After a contact is
`eligible` (both payment IDs), chat create / accept / decline uses Conceal smart messages on
module `contact` with ACTION_MAP verbs `create` / `register` / `revoke`, then
hands off to required Holepunch transport owned by the P2P runtime
(Node sidecar web-dev; Bare worklet on mobile — not the Vite bundle). See
[`docs/security/p2pchatprotocol.md`](../security/p2pchatprotocol.md),
[`docs/architecture/pairing-and-topics.md`](../architecture/pairing-and-topics.md),
and [`docs/architecture/mobile-p2p-runtime.md`](../architecture/mobile-p2p-runtime.md)
(and desktop Electron: [`electron-desktop.md`](../architecture/electron-desktop.md)).

Do not overload “invitation” in product copy without clarifying relationship vs chat.
Do not describe chat as a public room: topics are derived only via `deriveTopicRef`,
and peers are verified after connect.

## Purpose

The invitations feature is the bridge between discovery and a verified contact
relationship.

It must allow a user to:

- initiate a contact or relationship request
- receive an incoming relationship invitation
- accept, reject, ignore, or expire a relationship invitation
- become **eligible** for chat invites only after both payment IDs are present

Chat readiness after that point is owned by the P2P chat protocol (pending room,
register handoff, Holepunch connected) — not by this document alone.

## Product goals

The invitations system should:

- make first contact clear and low-friction
- avoid ambiguous states
- preserve user privacy
- support second-layer P2P chat bootstrap after a contact is eligible
  (see `p2pchatprotocol.md` — Holepunch is required for live chat)
- stay compatible with the web-first architecture and future wrapper delivery

## Core concepts

### Invitation

An invitation is a structured request from one user to another user asking to establish a contact relationship.

An invitation is not yet a chat session.

It may contain:

- sender identity reference
- recipient identity reference
- optional display metadata
- creation timestamp
- expiration timestamp
- invitation version
- transport metadata
- protocol payload reference

### Relationship

A relationship is the accepted result of a successful invitation flow.

A relationship can unlock:

- contact visibility
- permission to exchange further secure messages
- ability to open or bootstrap a chat session
- future P2P session negotiation

### Chat readiness

Chat readiness is a derived state, not a manual toggle.

A user should become chat-ready with another user only when:

- the invitation was accepted
- the required protocol data is valid
- the local app state has recorded the relationship
- any required security bootstrap is complete

## User stories

### Sender

As a sender, a user should be able to:

- search for or identify another user
- send an invitation with minimal friction
- see whether the invitation is pending, accepted, rejected, or expired
- retry if an invitation expires or fails
- understand whether chat is available yet

### Recipient

As a recipient, a user should be able to:

- see who invited them
- understand what accepting means
- accept or reject clearly
- avoid accidental acceptance
- move into chat only when the contact is eligible (both payment IDs)

## Invitation lifecycle

The invitation lifecycle should be explicit.

### States

Use these base states:

- `draft`
- `sending`
- `sent`
- `delivered`
- `pending`
- `accepted`
- `rejected`
- `expired`
- `failed`
- `cancelled`

Not every transport must expose all of these in the UI, but the domain model should still support clear transitions.

### Transition rules

Recommended transitions:

- `draft -> sending`
- `sending -> sent`
- `sent -> delivered`
- `delivered -> pending`
- `pending -> accepted`
- `pending -> rejected`
- `pending -> expired`
- `sending -> failed`
- `sent -> failed`
- `pending -> cancelled`

Rules:

- `accepted`, `rejected`, `expired`, and `cancelled` are terminal states unless a new invitation is created.
- A failed invitation should not silently become pending later.
- A new invitation should create a new record or revision, not overwrite historical state invisibly.

## UI requirements

### Invitation composer

The invitation entry point should be minimal.

Recommended UI elements:

- recipient selection or input
- short explanation of what happens next
- primary send action
- cancellation path
- loading and failure feedback

### Pending view

The pending state should clearly show:

- who the invitation is for
- current status
- whether user action is still needed
- whether retry or cancel is allowed

### Incoming invitation view

An incoming invitation view should include:

- sender identity label
- trust or recognition cues where available
- accept button
- reject button
- short privacy-aware explanation

## UX rules

- Keep wording calm and direct.
- Do not expose protocol language to normal users unless needed for debugging.
- Avoid dark 