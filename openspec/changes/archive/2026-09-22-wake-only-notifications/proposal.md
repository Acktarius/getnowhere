## Why

iOS users only see a notification after opening the app (#15). The lock-screen path waited on wallet sync so it could show decrypted preview text. That requires the app to be open, which defeats the wake. Notifications must be a parallel channel: generic, no content, no wallet.

## What Changes

- One peer-wake only: `POST /poke { to }` — same deployed gateway, no `kind`, no redeploy.
- That wake fires on invite accepted and on L1′ after L2 drop (again if ≥300s). Lock-screen copy stays what the gateway already sends (`Get NowHere` / `New message`).
- Invite received stays a local generic banner after wallet sync (no pokeHandle exists yet).
- Stop publishing local L1′ content banners (`Alice: hello`).
- iOS foreground zeros the icon pin and does **not** delete Notification Center entries.
- Settings copy: Wake contact covers accept + new message; banner toggle is invite-received only.

## Capabilities

### New Capabilities

- `wake-only-notifications`: Generic lock-screen wake (existing gateway) and invite-received local banner; iOS badge-clear without wiping Notification Center.

### Modified Capabilities

- (none)

## Impact

- App client only for poke body (`{ to }`). **poke-gateway source stays on the deployed contract.**
- `ConcealSmartMessageAdapter.acceptInvite` still pokes after `chat.register`
- Local banners, iOS `clearBadge`, Settings, feature docs
- Issues #15 and #16
