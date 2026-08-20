/**
 * Authorize `gnh:get-desktop-info` sync IPC replies (pure, unit-testable).
 * @see docs/architecture/electron-desktop.md
 */

/**
 * Preload may call sendSync during `new BrowserWindow` (about:blank) before
 * main can bind `webContents.id`. While unbound, return the prepared payload
 * so the renderer never falls back to ws://127.0.0.1:7901.
 *
 * @param {{
 *   desktopInfo: object | null | undefined,
 *   allowedWebContentsId: number | null | undefined,
 *   senderId: number,
 * }} opts
 * @returns {object | null}
 */
function resolveDesktopInfoReply({
  desktopInfo,
  allowedWebContentsId,
  senderId,
}) {
  if (!desktopInfo || typeof desktopInfo !== "object") return null;
  if (allowedWebContentsId == null) return desktopInfo;
  if (senderId === allowedWebContentsId) return desktopInfo;
  return null;
}

module.exports = { resolveDesktopInfoReply };
