# GitHub Pages docs + Linux/Windows desktop (Electron + sidecar)

**Two workflows.** Pages and desktop releases are independent.

| Workflow | File | Triggers |
|---|---|---|
| GitHub Pages | `.github/workflows/github-pages.yml` | `documentation/**` or the workflow file on `main`, `workflow_dispatch` |
| Release Electron + sidecar | `.github/workflows/release-electron-sidecar.yml` | `v*` tags, `workflow_dispatch` |

```text
Pages          documentation/website build → out/ → GitHub Pages (public docs)
Desktop Linux  npm run build → dist/ staged into package
                 Electron Forge zip/deb (Linux) + zip (Windows)
                 Arch makepkg of that linux-x64 tree → .pkg.tar.zst
                 ├─ Electron shell
                 ├─ embedded UI (resources/ui ← Vite dist/)
                 ├─ bundled Node (resources/runtime/node)
                 └─ holepunch-sidecar (resources/sidecar)
                      native IPC bridge (Unix socket / named pipe at runtime)
                 loads UI via loadFile(resources/ui/index.html)
```

Hyperswarm stays in the sidecar process. The Vite UI never imports it.

Packaged desktop does **not** load GitHub Pages at runtime. Embedding `dist/`
avoids a remote UI origin (Pages compromise / remote XSS surface) inside Electron.

Packaged identity: no Alice/Bob role; `userData` is `~/.config/getnowhere`;
single-instance lock; sidecar bridge over native IPC (no loopback WebSocket).
Older pre-release data under
`~/.config/getnowhere-desktop-alice` is orphaned (no migration) — remove manually
if present.

## Repo setup (once)

1. **Settings → Pages → Source = GitHub Actions** (public documentation site)

Expected URL: `https://acktarius.github.io/getnowhere/`. Do not claim Pages is
already live until that setting is confirmed.

## Vite `base`

Production UI build keeps `base: "./"` in `vite.config.ts` so assets work from
packaged Electron `file://` (`resources/ui/`) and other relative hosts.

Do not switch the Vite app to absolute `/` unless you only ever host that
bundle at domain root. GitHub Pages no longer deploys the Vite `dist/`.

## GitHub Pages workflow

Deploys the isolated Fumadocs site, not the root Vite application.

Triggers: push to `main` that touches `documentation/**` or
`.github/workflows/github-pages.yml`, or manual `workflow_dispatch`. Does
**not** run on version tags or ordinary application / `docs/**` changes.

- Job `build`: Node 24, `npm ci` in `documentation/website`,
  `GITHUB_ACTIONS=true npm run build`
- Uploads `documentation/website/out` via `upload-pages-artifact`
- Job `deploy` (`needs: build`): `deploy-pages` (environment `github-pages`)

Local docs development uses `http://localhost:3000/` without `/getnowhere`.
The CI build sets `basePath` / `assetPrefix` to `/getnowhere`.

## Release Electron + sidecar workflow

Triggers: `v*` tags, or manual `workflow_dispatch`. Independent of the Pages workflow.

Parallel jobs on `ubuntu-24.04` (Linux) and `windows-latest` (Windows). Those
jobs clear `GNH_HOLEPUNCH_WS_URL` and `VITE_HOLEPUNCH_WS_URL` so CI never forces
loopback WebSocket; packaged builds use native IPC at runtime (`main.mjs` sets
`GNH_BRIDGE_TRANSPORT=ipc` when spawning the sidecar). The Arch job waits for
the Linux zip, then runs `makepkg` inside a pinned `archlinux/archlinux:base-devel`
container.

- Root `npm ci` + `npm run build` → `dist/`
- Stages `dist/` → `resources/ui`, sidecar + official Node via `desktop-electron/scripts/prepare-sidecar.mjs`
- Syncs `desktop-electron` package version from repo-root `version` (`version=0.3.3` → `0.3.3`), **not** the git tag (so tags like `v0.3.3-f-droid` do not leak into filenames)
- Linux: `electron-forge make` → `.zip` + `.deb` under `desktop-electron/out/make`, then AppImage via pinned linuxdeploy + SHA-256 check (not the moving `continuous` tag)
- Arch / Omarchy: `desktop-electron/packaging/arch/PKGBUILD` packs that same linux-x64 zip (checked against the Linux job `SHA256SUMS.txt`) into `Get_NowHere-vX.Y.Z-x86_64.pkg.tar.zst`. The prebuilt Electron tree is copied to `/opt/getnowhere` and is not stripped ([Electron package guidelines](https://wiki.archlinux.org/title/Electron_package_guidelines)). `makepkg --nodeps` runs as an unprivileged user (`depends=` are runtime-only; not needed to assemble the archive). `namcap --exclude elffiles` must report no `E:` lines (`elffiles` falsely rejects `/opt/$pkgname`; `W:` dependency heuristics are allowed; on failure CI prints the `E:` lines). License is `BSD-3-Clause` with the text under `/usr/share/licenses/getnowhere/`. A follow-up job in pinned `archlinux/archlinux:base` runs `pacman -U`, checks `ldd` for missing libraries, then removes the package. Both images use the 2026-10-29 digests from conceal-core, then `pacman -Syu`.
- Bundled Node (`GNH_BUNDLE_NODE_VERSION`) is verified against official `SHASUMS256.txt` before extract (`desktop-electron/scripts/prepare-sidecar.mjs`)
- Canonical artifact names (always `v` + `version` file):
  - `Get_NowHere-v0.3.3-x86_64.AppImage`
  - `Get_NowHere-v0.3.3-amd64.deb`
  - `Get_NowHere-v0.3.3-linux-x64.zip`
  - `Get_NowHere-v0.3.3-x86_64.pkg.tar.zst`
  - `Get_NowHere-v0.3.3-win32-x64.zip`
- Windows: `electron-forge make --platform=win32` → `.zip` under `desktop-electron/out/make/zip/win32/x64`
- Uploads CI artifacts as `getnowhere-linux-desktop-vX.Y.Z`, `getnowhere-arch-desktop-vX.Y.Z`, and `getnowhere-windows-desktop-vX.Y.Z`
- On `v*` tags a **draft** GitHub Release titled **Get NowHere vX.Y.Z** (title/version from `version` file) bundles Linux, Arch, and Windows assets and combined checksums
- Manual dispatch without a tag still builds and uploads artifacts from the `version` file; it does not create a release

Packaged UI path: `process.resourcesPath/ui/index.html` (`loadFile`). Override with `GNH_UI_URL` if needed.

## Install / run (user)

### Linux

1. Download the `.deb`, `.AppImage`, or `.zip` from the draft release / Actions artifact.
2. Install or extract and run `getnowhere`.
3. App starts Electron, spawns sidecar on a per-launch IPC socket/pipe, loads
   embedded UI, and talks to that private bridge (not `ws://127.0.0.1:7901`).

### Arch Linux and Omarchy

1. Download `Get_NowHere-vX.Y.Z-x86_64.pkg.tar.zst` and `SHA256SUMS.txt`.
2. Check the file with `sha256sum -c SHA256SUMS.txt`.
3. Install with `sudo pacman -U ./Get_NowHere-vX.Y.Z-x86_64.pkg.tar.zst`.
4. Run `getnowhere`. Removing the package (`sudo pacman -R getnowhere`) leaves
   `~/.config/getnowhere` in place.

The package name inside pacman is `getnowhere`. It is `BSD-3-Clause` (repo
`LICENCE` installed under `/usr/share/licenses/getnowhere/`). It depends on the
libraries Electron links (GTK 3, NSS, Mesa, ALSA, and the smaller X/AT-SPI
packages listed in the PKGBUILD).

### Windows

1. Download the `.zip` from the draft release / Actions artifact.
2. Extract and run `getnowhere.exe`.
3. Same sidecar + embedded UI behavior as Linux.

Alice/Bob on one machine (dev): keep using `npm run desktop:alice` / `desktop:bob` with `npm run dev`.

## Local make (maintainer)

```bash
npm run holepunch:install
npm run desktop:install
npm run build
# Optional: regenerate icons/icon.png (ImageMagick `convert`/`magick`, or resvg fallback)
bash desktop-electron/scripts/make-icon.sh
npm run desktop:make
```

Artifacts: `desktop-electron/out/make/deb/x64/*.deb`, `…/zip/linux/x64/*.zip`, and (Windows) `…/zip/win32/x64/*.zip`.

Desktop icons: `desktop-electron/icons/icon.png` (Linux `.deb`), `icon.ico` (Windows zip), wired in `forge.config.cjs` via base path `icons/icon`.

## Out of scope here

- macOS Forge makers
- nexe single-file sidecar
- `getnowhere.im` DNS / `public/CNAME` until confirmed

## Related

- `docs/architecture/electron-desktop.md`
- `docs/architecture/holepunch-sidecar.md`
- `docs/architecture/web-vs-wrapper.md`
- `documentation/content/` (public Pages source)
