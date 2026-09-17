## Purpose

Gives mobile hosts durable, fail-closed local persistence for the encrypted
wallet file and app preferences so process death or WebView recreation cannot
reset the app to a fresh Welcome state, without changing web or desktop
storage.

## ADDED Requirements

### Requirement: Mobile native storage is the source of truth

On mobile hosts, the active storage adapter SHALL persist the `"wallet"` blob
and all other `getStorage()` application keys in native durable storage. WebView
`localStorage` MUST NOT be the authoritative store for those keys. Web and
desktop hosts SHALL continue to use the existing web storage adapter.

#### Scenario: Mobile wallet and prefs survive process death

- **GIVEN** a mobile host with a stored wallet and non-default settings
- **WHEN** the process dies or the WebView is recreated
- **THEN** the stored wallet still exists
- **AND** settings and theme remain present
- **AND** the app does not return to a fresh Welcome-only state

#### Scenario: Web and desktop adapters unchanged

- **GIVEN** a browser or desktop host
- **WHEN** the app reads or writes `getStorage()` keys
- **THEN** behavior remains the existing web storage adapter
- **AND** no mobile native adapter is installed

### Requirement: Adapter is installed before UI hydration

On mobile hosts, the native storage adapter SHALL be installed and marked
ready before any production path reads wallet existence, settings, onboarding,
or contacts/rooms catalogs. If the native bridge is missing, startup MUST
block with a controlled fatal screen and MUST NOT fall back to WebView
storage.

#### Scenario: Boot installs adapter before wallet check

- **GIVEN** a mobile host with the native bridge available
- **WHEN** the UI bootstrap starts
- **THEN** the native adapter is installed and ready before `hasStoredWallet`
  or settings hydration runs

#### Scenario: Missing bridge is fatal

- **GIVEN** a mobile host without the native storage bridge
- **WHEN** bootstrap attempts to install the adapter
- **THEN** startup is blocked with a controlled fatal screen
- **AND** WebView `localStorage` is not used as a fallback

### Requirement: Wallet file versus app preferences split

The `"wallet"` key SHALL be stored as a single app-private encrypted file.
All other adapter-managed keys SHALL be stored in native secure preferences
under a dedicated `gnh.app:` namespace. Biometric enrollment, app-access
credentials, and session keep-alive keys MUST remain on their existing
unprefixed names and lifecycle.

#### Scenario: Wallet routes to the encrypted file

- **GIVEN** a mobile adapter
- **WHEN** the app writes the `"wallet"` key
- **THEN** the value is persisted only as the encrypted wallet file
- **AND** it is not stored as a giant secure-prefs value

#### Scenario: Prefs route to namespaced secure prefs

- **GIVEN** a mobile adapter
- **WHEN** the app writes `gnh.settings` or other non-wallet adapter keys
- **THEN** the values are stored under `gnh.app:` in native secure prefs
- **AND** biometric and session keys are not added to the adapter key index

### Requirement: Wallet writes await durable completion

Create, import, update, and delete of the `"wallet"` blob SHALL await native
durable completion before the calling workflow reports success. The in-memory
adapter view of `"wallet"` SHALL update only after that success. Ordinary
non-wallet preferences MAY update memory first and flush serially, provided
failures are retained and surfaced.

#### Scenario: Wallet create reports success only after durable write

- **GIVEN** a mobile host creating or importing a wallet
- **WHEN** the wallet workflow finishes successfully
- **THEN** the native encrypted wallet file already exists
- **AND** a subsequent process death still reports the wallet as present

#### Scenario: Failed wallet write is not treated as stored

- **GIVEN** a mobile host whose native wallet write fails
- **WHEN** the create or import workflow observes the failure
- **THEN** success is not reported to the user
- **AND** the in-memory adapter does not claim a stored wallet

### Requirement: Wallet presence is tri-state

Mobile wallet presence SHALL distinguish `present`, `absent`, and
`unreadable`. `absent` is allowed only after a successful native existence
check returns false. Bridge, I/O, malformed-envelope, authentication, and
missing Keystore-key failures SHALL be `unreadable`. Boolean `hasStoredWallet`
MAY be true only for `present`. Startup MUST handle `unreadable` before
Welcome and MUST NOT collapse it to absent.

#### Scenario: Missing file is absent

- **GIVEN** native prefs are available
- **WHEN** wallet-file existence completes successfully and returns false
- **THEN** the wallet state is `absent`
- **AND** first-run Welcome is allowed

#### Scenario: Decrypt failure is unreadable

- **GIVEN** a wallet file that exists but fails authentication or envelope parse
- **WHEN** startup evaluates wallet presence
- **THEN** the state is `unreadable`
- **AND** the file is left in place
- **AND** Welcome create/import is not offered as a fresh-wallet path
- **AND** the UI does not show raw native exceptions, paths, or crypto traces

### Requirement: Wallet file is encrypted at rest

The mobile wallet file SHALL use authenticated encryption with a
versioned envelope, a fresh 96-bit nonce per write, a 128-bit
authentication tag, and fixed AAD `getnowhere:wallet-file:v1`. Android SHALL
use a non-exportable Keystore AES-256-GCM key and platform
`AES/GCM/NoPadding`, not new Jetpack security-crypto APIs. If required
Keystore capabilities are unavailable, the system MUST surface an
unsupported-storage error and MUST NOT write a plaintext wallet. The
file-encryption key MUST NOT add per-operation biometric or user-auth
requirements. A missing or unusable Keystore key while the file remains
SHALL be `unreadable`, not `absent`.

#### Scenario: Replacement write uses a new nonce

- **GIVEN** an existing encrypted wallet file
- **WHEN** the wallet blob is written again
- **THEN** the file is atomically replaced
- **AND** a new nonce is used
- **AND** authenticated decryption of the new file yields the latest blob

#### Scenario: Tampered file does not yield plaintext

- **GIVEN** a wallet file whose ciphertext or tag is corrupted
- **WHEN** native read is attempted
- **THEN** no partial plaintext is returned
- **AND** the file is not overwritten or deleted
- **AND** the result is a storage error, not absence

#### Scenario: File exists but Keystore key is missing

- **GIVEN** a wallet file on disk and no usable Keystore key for that file
- **WHEN** startup evaluates wallet presence
- **THEN** the state is `unreadable`
- **AND** the file is left in place
- **AND** Welcome create/import is not offered as a fresh-wallet path

### Requirement: Wallet material is excluded from OS backup

On Android, the encrypted wallet file, same-directory temp files, and
`gnh-secure-prefs` values used by the adapter MUST be excluded from Auto
Backup and from device-to-device transfer. On iOS, the wallet file MUST be
marked excluded from iCloud / iTunes backup. Cloud restore of ciphertext
without the original hardware-backed key is not a supported recovery path.

#### Scenario: Android backup rules omit the wallet file

- **GIVEN** an Android build that stores `wallet.v1.enc`
- **WHEN** Auto Backup or device transfer rules are inspected
- **THEN** the wallet file directory and adapter secure-prefs store are
  excluded
- **AND** a restored device does not receive that ciphertext as a
  decryptable wallet

### Requirement: Adapter-owned key index for wipe

The mobile adapter SHALL maintain `gnh.app:__keys:v1` listing adapter-managed
non-wallet keys. Set and remove SHALL update the namespaced value and the
index through the same serialized operation. Reset SHALL read the index,
delete listed keys, delete the index, and remove the encrypted wallet file.
Wallet read, write, and remove SHALL be single-writer serialized so reset
cannot interleave with a late write.

#### Scenario: Reset clears adapter-owned native data

- **GIVEN** namespaced prefs, a key index, and an encrypted wallet file
- **WHEN** the user confirms Reset app data
- **THEN** listed `gnh.app:` keys and the index are removed
- **AND** the encrypted wallet file is removed
- **AND** biometric and session keep-alive keys are not cleared via the index

### Requirement: No legacy WebView migration

The system MUST NOT migrate values from WebView `localStorage` into native
storage. Losing existing mobile test data is acceptable.

#### Scenario: Fresh native store after install

- **GIVEN** leftover values in WebView `localStorage`
- **WHEN** the mobile adapter is installed
- **THEN** those values are not copied into native storage
- **AND** wallet presence is determined only from native durable storage
