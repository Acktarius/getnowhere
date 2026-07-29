# Delta for Desktop Shell Runtime

## ADDED Requirements

### Requirement: Packaged builds carry no dev role

The Electron shell SHALL resolve its runtime identity from whether the app is
packaged, and packaged builds SHALL NOT adopt the Alice/Bob development role.

#### Scenario: Packaged launch has no role

- GIVEN the app is packaged
- WHEN the shell resolves its desktop identity
- THEN the role is absent
- AND the log prefix is `[desktop]`
- AND the app name and `userData` directory name are `getnowhere`
- AND the session partition is `persist:gnh`
- AND the window title is `Get Now Here` with no role or mode tag

#### Scenario: Packaged launch ignores harness environment variables

- GIVEN the app is packaged
- WHEN `GNH_ROLE` is `bob`, `GNH_SWARM_MODE` is `shared`, and
  `GNH_SIDECAR_TOKEN` is set in the environment
- THEN the resolved identity still has no role
- AND the swarm mode is `isolated`
- AND the bridge token is a freshly generated value, not the environment value

#### Scenario: Development launch keeps the Alice/Bob harness

- GIVEN the app is not packaged
- WHEN `GNH_ROLE` is unset
- THEN the role is `alice`, the log prefix is `[desktop:alice]`, the app name and
  `userData` directory name are `getnowhere-desktop-alice`, the partition is
  `persist:gnh-alice`, the swarm mode is `shared`, and the port is `7901`

#### Scenario: Development bob in isolated mode keeps its own port

- GIVEN the app is not packaged
- WHEN `GNH_ROLE` is `bob` and `GNH_SWARM_MODE` is `isolated`
- THEN the partition is `persist:gnh-bob` and the port is `7902`

### Requirement: Packaged builds leave no predictable local footprint

Privacy is the product goal, so a packaged shell SHALL NOT expose a stable,
guessable local bridge. It SHALL bind an ephemeral port and authenticate with a
token generated per launch.

#### Scenario: Ephemeral port per launch

- GIVEN the app is packaged and `HOLEPUNCH_PORT` is unset
- WHEN the shell spawns its sidecar
- THEN the sidecar binds an operating-system assigned port on the loopback
  interface
- AND the shell learns the actual bound port from the sidecar via IPC before
  connecting
- AND two consecutive launches do not reuse a fixed, documented port

#### Scenario: Per-launch bridge token, no lockfile

- GIVEN the app is packaged
- WHEN the shell spawns its sidecar
- THEN the bridge token is generated fresh for that launch
- AND no token lockfile is written to the temporary directory

#### Scenario: Packaged builds never attach to a foreign bridge

- GIVEN the app is packaged
- WHEN a WebSocket bridge from another process is already listening on loopback
- THEN the shell still spawns and uses its own sidecar
- AND it does not connect to the pre-existing listener

#### Scenario: Explicit port override is still honored

- GIVEN the app is packaged
- WHEN `HOLEPUNCH_PORT` is set to a specific value
- THEN the sidecar binds that port instead of an ephemeral one

#### Scenario: Development attach behavior is preserved

- GIVEN the app is not packaged and swarm mode is `shared`
- WHEN the configured port `7901` is already accepting connections
- THEN the shell attaches to the existing bridge and adopts the shared token, as
  it does today

### Requirement: Packaged builds run as a single instance

A packaged shell SHALL permit only one running instance per `userData` profile
so Chromium storage is never opened by two processes.

#### Scenario: Second packaged launch focuses the first

- GIVEN a packaged instance is already running
- WHEN the executable is launched again
- THEN the second process exits without starting a sidecar or a window
- AND the existing window is restored and focused

#### Scenario: Development allows two instances

- GIVEN the app is not packaged
- WHEN a second instance is launched with a different role
- THEN both instances run, preserving Alice/Bob testing

### Requirement: Sidecar reports its bound port, bind failures, and parent death

The Hyperswarm sidecar SHALL announce the port it actually bound over IPC when
an IPC channel is present, SHALL handle WebSocket server errors rather than
emitting an unhandled error event, and SHALL exit when its parent process dies.

#### Scenario: Ephemeral bind announces the real port over IPC

- GIVEN `HOLEPUNCH_PORT` is `0` and the sidecar was spawned with an IPC channel
- WHEN the sidecar starts listening
- THEN it sends `{ type: "listening", host, port }` where `port` is the
  operating-system assigned port, not `0`
- AND it also logs a listening line containing that real port

#### Scenario: Address already in use

- GIVEN the configured host and port are already bound by another process
- WHEN the sidecar starts
- THEN it logs a message identifying the address conflict
- AND it exits with a non-zero status

#### Scenario: Parent process dies

- GIVEN the sidecar was spawned as a child of the Electron shell
- WHEN the parent process exits without a graceful stop
- THEN the sidecar exits and tears down its Hyperswarm mesh

## MODIFIED Requirements

### Requirement: Desktop bridge exposure

The preload bridge SHALL expose `holepunchWsUrl`, `wsToken`, and `ufwState` to
the renderer, and SHALL expose `role` only when a development role is in effect.
Sandboxed `preload.cjs` SHALL be self-contained (no local `require`) so
`window.gnhDesktop` is always defined in the Electron renderer.

#### Scenario: Preload exposes gnhDesktop under sandbox

- GIVEN the Electron window uses `sandbox: true` and `contextIsolation: true`
- WHEN the renderer evaluates `window.gnhDesktop`
- THEN the value is an object (not `undefined`)
- AND `holepunchWsUrl` and `wsToken` are strings (token may be empty only for
  open web-dev sidecars without auth)

#### Scenario: Packaged bridge omits role

- GIVEN the app is packaged
- WHEN the renderer reads `window.gnhDesktop`
- THEN `role` is absent
- AND `holepunchWsUrl` carries the ephemeral port the sidecar reported
- AND `wsToken` and `ufwState` are present and unchanged in meaning

#### Scenario: Development bridge carries the role

- GIVEN the app is not packaged and `GNH_ROLE` is `bob`
- WHEN the renderer reads `window.gnhDesktop`
- THEN `role` is `bob`
