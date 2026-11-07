import { describe, expect, it } from "vitest";
import { buildIosBundledUiPaths } from "../../native-wrapper/src/webviewNavigation";

describe("buildIosBundledUiPaths", () => {
  const varBundle =
    "file:///var/containers/Bundle/Application/UUID/GetNowHere.app/";
  const privateBundle =
    "file:///private/var/containers/Bundle/Application/UUID/GetNowHere.app/";

  it("canonicalizes /var bundleDirectory so source, prefix, and read access match", () => {
    const paths = buildIosBundledUiPaths(varBundle);
    expect(paths.indexUri).toBe(`${privateBundle}ui/index.html`);
    expect(paths.assetPrefix).toBe(`${privateBundle}ui/`);
    expect(paths.readAccessUrl).toBe(`${privateBundle}ui`);
    expect(paths.indexUri.startsWith(paths.assetPrefix)).toBe(true);
    expect(paths.indexUri.startsWith(`${paths.readAccessUrl}/`)).toBe(true);
  });

  it("leaves already-/private/var paths unchanged and keeps ui/ confinement", () => {
    const paths = buildIosBundledUiPaths(privateBundle.slice(0, -1)); // no trailing slash
    expect(paths.indexUri).toBe(`${privateBundle}ui/index.html`);
    expect(paths.assetPrefix).toBe(`${privateBundle}ui/`);
    expect(paths.readAccessUrl).toBe(`${privateBundle}ui`);
    expect(paths.readAccessUrl.endsWith("/ui")).toBe(true);
    expect(paths.readAccessUrl.endsWith(".app")).toBe(false);
  });
});
