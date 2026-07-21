# Invitations Feature

This document defines the invitations feature for Get Now Here. It explains how one user initiates contact with another user, how invitation state is tracked, and how the app transitions from a relationship request into an available chat session.

## Purpose

The invitations feature is the bridge between discovery and conversation.

It must allow a user to:

- initiate a contact or relationship request
- receive an incoming invitation
- accept, reject, ignore, or expire an invitation
- unlock the next communication step only after the invitation reaches a valid accepted state

This feature should feel simple in the UI, but the internal state model must be explicit and reliable.

## Product goals

The invitations system should:

- make first contact clear and low-friction
- avoid ambiguous states
- preserve user privacy
- support a future second-layer P2P chat bootstrap
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
- move into chat only when the relationship is truly established

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