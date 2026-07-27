# Retire L3 naming — L1 / L1′ / L2 only

## Why

Docs called ChaCha live-frame AEAD “L3,” implying a third network layer.
Product model is **L1** (SmartMessage + session-key uses) and **L2** (Holepunch
Noise), plus **L1′** as the availability fallback when L2 is down.

## What Changes

- Canonical vocabulary: L1, L1′, L2 only — retire “L3” in docs and rules.
- L1 = signaling derive **and** sealing live envelopes with session keys.
- L1′ = `chat.relay` / `{contact,e,…}` when L2 unavailable.
- Fix relay wording (not “L3-sealed”); document unified room by `roomId` + time.
- Docs/rules/comment only — no wire or runtime behavior change.

## Capabilities

- `crypto-layering`: L1 / L1′ / L2 vocabulary + dual-source room UX

## Impact

Agents and threat reviews stop inventing a third layer or “drop L3” shortcuts.
