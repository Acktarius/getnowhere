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

- encrypted payloads exchanged in second-layer peer chat
- invitation bootstrap payloads when they carry encrypted data
- locally persisted encrypted message material
- stored session secrets and related metadata

This document does not define blockchain-level encryption already provided elsewhere. It defines the app-level encryption expectations for this repository.

## Core rules

- Use authenticated encryption, not encryption without integrity.
- Never reuse a nonce with the same key.
- Keep keys, nonces, and ciphertext handling explicit in code.
- Separate protocol metadata from encrypted content.
- Treat cryptographic failure as a hard failure, not a warning.
- Version payload formats from the start.
- Keep cryptographic code centralized in dedicated services.

## Algorithm profile

Current baseline:

- algorithm: `ChaCha20-Poly1305`
- key size: 256 bits
- nonce size: 96 bits
- authentication tag: 128 bits

Do not change this profile silently. Any proposed change must update this file and the protocol document before implementation.

## Nonce rules

Nonce management is critical.

Rules:

- A nonce must be unique for every encryption under the same key.
- Do not generate nonces in an ad hoc way in UI code.
- Do not reuse a nonce after retry, reconnect, or app restart unless the protocol guarantees uniqueness.
- Prefer a structured nonce strategy that is deterministic within a session and safe across senders.

Recommended direction:

- use per-session send counters
- derive or assign sender-scoped nonce space
- keep nonce generation inside a dedicated crypto or session service

If nonce uniqueness cannot be guaranteed, do not ship the implementation.

## Associated data

Use associated data for non-secret metadata that must be authenticated along with the ciphertext.

Typical associated data may include:

- protocol version
- message type
- sender logical identifier
- recipient logical identifier
- session identifier
- sequence number

Rules:

- associated data must be identical on encrypt and decrypt
- associated data must not contain secrets unless the protocol explicitly requires it
- do not leave critical routing or version metadata unauthenticated if it affects message interpretation

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