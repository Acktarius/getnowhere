/**
 * Packaged vs Alice/Bob harness identity for the Electron shell.
 * @see docs/architecture/electron-desktop.md
 * @see specs/changes/packaged-desktop-identity/design.md
 */

/**
 * @typedef {object} DesktopIdentity
 * @property {string | null} role
 * @property {string} logPrefix
 * @property {string} appName
 * @property {string} userDataDirName
 * @property {string} partition
 * @property {string} titleBase
 * @property {boolean} showsModeTag
 * @property {"shared" | "isolated"} swarmMode
 * @property {string} host
 * @property {number} port
 * @property {boolean} usesEphemeralPort
 * @property {boolean} usesTokenLock
 * @property {boolean} singleInstance
 */

/**
 * @param {{ isPackaged: boolean, env?: NodeJS.ProcessEnv | Record<string, string | undefined> }} opts
 * @returns {DesktopIdentity}
 */
export function resolveDesktopIdentity({ isPackaged, env = {} }) {
  const holepunchHost = env.HOLEPUNCH_HOST?.trim() || "127.0.0.1";
  const holepunchPortRaw = env.HOLEPUNCH_PORT?.trim();

  if (isPackaged) {
    const portExplicit = holepunchPortRaw !== undefined && holepunchPortRaw !== "";
    const port = portExplicit ? Number(holepunchPortRaw) : 0;
    return {
      role: null,
      logPrefix: "[desktop]",
      appName: "getnowhere",
      userDataDirName: "getnowhere",
      partition: "persist:gnh",
      titleBase: "Get Now Here",
      showsModeTag: false,
      swarmMode: "isolated",
      host: holepunchHost,
      port: Number.isFinite(port) ? port : 0,
      usesEphemeralPort: !portExplicit,
      usesTokenLock: false,
      singleInstance: true,
    };
  }

  const role = (env.GNH_ROLE ?? "alice").toLowerCase() === "bob" ? "bob" : "alice";
  const roleLabel = role === "bob" ? "Bob" : "Alice";
  const swarmMode =
    (env.GNH_SWARM_MODE ?? "shared").toLowerCase() === "isolated"
      ? "isolated"
      : "shared";
  const isIsolated = swarmMode === "isolated";
  const defaultPort = isIsolated && role === "bob" ? 7902 : 7901;
  const port = holepunchPortRaw ? Number(holepunchPortRaw) : defaultPort;

  return {
    role,
    logPrefix: `[desktop:${role}]`,
    appName: `getnowhere-desktop-${role}`,
    userDataDirName: `getnowhere-desktop-${role}`,
    partition: `persist:gnh-${role}`,
    titleBase: `Get Now Here — ${roleLabel}`,
    showsModeTag: true,
    swarmMode,
    host: holepunchHost,
    port: Number.isFinite(port) ? port : defaultPort,
    usesEphemeralPort: false,
    usesTokenLock: !isIsolated,
    singleInstance: false,
  };
}
