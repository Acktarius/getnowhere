import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const pkgbuild = readFileSync(
  path.join(root, "desktop-electron/packaging/arch/PKGBUILD"),
  "utf8",
);
const desktop = readFileSync(
  path.join(root, "desktop-electron/packaging/arch/getnowhere.desktop"),
  "utf8",
);
const workflow = readFileSync(
  path.join(root, ".github/workflows/release-electron-sidecar.yml"),
  "utf8",
);

const archImage =
  "archlinux/archlinux:base-devel@sha256:a3c048d95acbbf5acc15a9e9a727d3cae2ba2ac69aa8b24d8ccd4f60b3102f28";
const archBaseImage =
  "archlinux/archlinux:base@sha256:e4954feb61c332472f9cbf0e797a23be64434cf71db429349976192b4de782fc";

describe("Arch package recipe", () => {
  it("installs the prebuilt Electron tree under /opt and does not strip it", () => {
    expect(pkgbuild).toContain("pkgname=getnowhere");
    expect(pkgbuild).toContain("license=('BSD-3-Clause')");
    expect(pkgbuild).not.toContain("license=('unknown')");
    expect(pkgbuild).toContain("options=('!strip' '!debug' '!lto')");
    expect(pkgbuild).toContain('install -dm755 "$pkgdir/opt/getnowhere"');
    expect(pkgbuild).toContain(
      'find "$pkgdir/opt/getnowhere" -type d -exec chmod 755 {} +',
    );
    expect(pkgbuild).toContain("install-cli-wrapper.sh");
    expect(pkgbuild).toContain("WRAPPER_SHA256");
    expect(pkgbuild).not.toContain("$startdir");
    expect(pkgbuild).toContain(
      'bash "$wrapper" "$pkgver" /opt/getnowhere/getnowhere "$pkgdir/usr/bin/getnowhere"',
    );
    expect(pkgbuild).toContain(
      'local wrapper="$srcdir/install-cli-wrapper.sh"',
    );
    expect(pkgbuild).not.toContain(
      'ln -s /opt/getnowhere/getnowhere "$pkgdir/usr/bin/getnowhere"',
    );
    expect(pkgbuild).toContain(
      'install -Dm644 LICENSE "$pkgdir/usr/share/licenses/$pkgname/LICENSE"',
    );
    for (const dep of [
      "alsa-lib",
      "at-spi2-core",
      "dbus",
      "expat",
      "glib2",
      "glibc",
      "gtk3",
      "libgcc",
      "libnotify",
      "libstdc++",
      "libxcrypt-compat",
      "mesa",
      "nss",
      "systemd-libs",
      "xdg-utils",
    ]) {
      expect(pkgbuild).toContain(dep);
    }
    expect(desktop).toContain("Exec=getnowhere %U");
    execFileSync("bash", [
      "-n",
      path.join(root, "desktop-electron/packaging/arch/PKGBUILD"),
    ]);
  });
});

describe("release workflow Arch job", () => {
  it("builds .pkg.tar.zst in the pinned Arch container and publishes it", () => {
    expect(workflow).toContain("desktop-arch:");
    expect(workflow).toContain(archImage);
    expect(workflow).toContain("desktop-arch-test:");
    expect(workflow).toContain(archBaseImage);
    expect(workflow).toContain("makepkg --nodeps --noconfirm --log");
    expect(workflow).toContain('cp LICENCE "$work/LICENSE"');
    expect(workflow).toContain("LICENSE_SHA256");
    expect(workflow).toContain("WRAPPER_SHA256");
    expect(workflow).toContain("namcap --exclude=elfpaths PKGBUILD");
    expect(workflow).toContain("namcap reported errors:");
    expect(workflow).toContain("/usr/share/licenses/getnowhere/LICENSE");
    expect(workflow).toContain("pacman -U --noconfirm");
    expect(workflow).toContain("directories are not world-traversable:");
    expect(workflow).toContain("getnowhere --version");
    expect(workflow).toContain("getnowhere -v");
    expect(workflow).toContain("packaging/deb-cli-wrapper.sh");
    expect(workflow).toContain(
      "needs: [desktop-linux, desktop-windows, desktop-arch-test]",
    );
    expect(workflow).toContain("release-assets/*.pkg.tar.zst");
    expect(workflow).toContain("*.pkg.tar.zst");
  });
});
