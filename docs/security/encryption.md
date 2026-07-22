# Encryption

This document defines the current encryption rules for Get Now Here. It is a practical implementation guide for developers and a boundary document for Cursor, so security-sensitive changes stay consistent across the codebase.

## Purpose

The goal is to protect message confidentiality, integrity, and session correctness without scattering cryptographic decisions across UI and feature code.

This document defines:

- the default encryption primitive
- key handling expectations
- nonce rules
- associated data rules
- storage rules
- implementation boundaries
- review rules for future changes

## Default primitive

Use **ChaCha20-Poly1305** as the default authenticated encryption primitive for peer message payloads.

Reasons:

- it provides authenticated encryption
- it is well standardized
- it is a strong fit for software implementations
- it keeps confidentiality and integrity in one construction

Do not design a custom encryption scheme when a standard AEAD construction already fits the use case.

## Scope

This document applies to:

- encrypted payloads exchanged in second-layer peer chat (Holepunch frames)
- invitation bootstrap payloads when they carry encrypted data
- locally persisted encrypted message material
- stored session secrets and related metadata

This document does not define blockchain-level encryption already provided elsewhere. It defines the app-level encryption expectations for this repository.

### Key categories for chat

| Category | When used | Wipe |
|---|---|---|
| Invite/bootstrap material | During create/register signaling | On tombstone (decline/expiry/destroy) |
| Session keys (send/recv refs) | After session derive; seal/open only when Holepunch-connected | On room destroy / tombstone / logout |
| Ephemeral X25519 private keys | Memory only during handshake | Immediately after derive |

Session keys must not be used to encrypt live chat until the room lifecycle is `connected`. Invite acceptance alone is not sufficient.

## Core rules

- Use authenticated encryption, not encryption without integrity.
- Never reuse a nonce with the same key.
- Keep keys, nonces, and ciphertext handling explicit in code.
- Separate protocol metadata from encrypted content.
- Treat cryptographic failure as a hard failure, not a warning.
- Version payload formats from the start.
- Keep cryptographic code centralized in dedicated services.

## Algorithm profile

Current baseline (`CHACHA20_POLY1305_V1`):

- algorithm: **ChaCha20-Poly1305 (RFC 8439)** — IETF AEAD with 96-bit nonce
- key size: 256 bits
- nonce size: **96 bits (12 bytes)**
- authentication tag: 128 bits
- KDF: HKDF-SHA256
- ECDH: X25519

**Not used for this suite:** XChaCha20-Poly1305 (extended 192-bit nonce). The
`@noble/ciphers` package can construct both; this project must call the
ChaCha20-Poly1305 helper only for `CHACHA20_POLY1305_V1`. A future XChaCha
suite would need a new id (e.g. `XCHACHA20_POLY1305_V1`) and a protocol bump.

Do not change this profile silently. Any proposed change must update this file
and `p2pchatprotocol.md` before implementation.

## Key schedule (P2P session)

1. Generate ephemeral X25519 keypairs (Alice on create, Bob on register).
2. `shared = X25519(local_private, remote_public)`.
3. `okm = HKDF-SHA256(ikm=shared, salt=handshake.salt, info=version|suite|relationshipId|roomId, L=64)`.
4. Split: `okm[0:32]` = initiator→responder key; `okm[32:64]` = responder→initiator key.
5. Map to local `sendKey` / `recvKey` by role; store as refs; wipe ephemeral privates.

Session keys may be derived at accept/handoff but **must not seal live chat**
until room lifecycle is `connected`.

## Nonce rules

Nonce management is critical. RFC 8439 ChaCha20-Poly1305 is catastrophically
broken by nonce reuse under the same key.

### Strategy: `counter_from_seed`

- `nonceSeed`: 256-bit random from handshake (hex).
- Per seal under the **send** key:
  - `nonce_12 = HKDF-SHA256(ikm=nonceSeed, salt=UTF8("send"|"recv"), info=UTF8("nonce|" + counter), L=12)`
  - persist and increment `sendCounter` **after** successful seal preparation
- Directions never share a key, so Alice’s send counter space is independent of Bob’s.
- After reconnect or app restart: restore `sendCounter` / `recvCounter` before any seal.
- Do not generate nonces in UI code.
- Do not use random 96-bit nonces without a uniqueness proof — counters are required.

If nonce uniqueness cannot be guaranteed, do not ship the implementation.

### Associated data (AAD)

When sealing Holepunch content frames, prefer AAD covering at least:

- protocol / content schema version
- roomId / sessionId
- message kind (`text` | `reaction` | `edit` | `delete`)

AAD must match on decrypt or open fails closed.

## Key categories

Separate keys by purpose.

Recommended categories:

- long-term identity secrets
- invitation bootstrap secrets
- session keys for peer messaging
- storage encryption keys
- optional future recovery or rotation material

Rules:

- do not reuse one key for unrelated roles
- do not let UI components hold raw key material longer than necessary
- use typed structures so code makes the key purpose obvious

## Key lifecycle

Every key used by the app must have a defined lifecycle.

Track for each key category:

- how it is created
- where it is stored
- when it is loaded
- what it can encrypt or authenticate
- how it rotates
- how it is invalidated
- how it is destroyed or forgotten

Rules:

- session keys should be scoped to a specific relationship or chat session
- expired or replaced keys must not stay silently active
- key rotation must preserve message parsing rules through versioning

## Local storage rules

If encrypted material or secret material 
