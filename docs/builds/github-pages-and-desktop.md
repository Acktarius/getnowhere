# GitHub Pages UI + Linux desktop (Electron + sidecar)

**Two workflows.** Pages and desktop releases are independent.

| Workflow | File | Triggers |
|---|---|---|
| GitHub Pages | `.github/workflows/github-pages.yml` | push to `main`, `workflow_dispatch` |
| Release Electron + sidecar | `.github/workflows/release-electron-sidecar.yml` | `v*` tags, `workflow_dispatch` |

```text
Pages          npm run build → dist/ → GitHub Pages (browser)
Desktop Linux  npm run build → dist/ staged into package
                 Electron Forge zip/deb
                 ├─ Electron shell
                 ├─ embedded UI (resources/ui ← Vite dist/)
                 ├─ bundled Node (resources/runtime/node)
                 └─ holepunch-sidecar (resources/sidecar)
                      ephemeral loopback port (IPC reports bound port)
                 loads UI via loadFile(resources/ui/index.html)
```

Hyperswarm stays in the sidecar process. The Vite UI never imports it.

Packaged desktop does **not** load GitHub Pages at runtime. Embedding `dist/`
avoids a remote UI origin (Pages compromise / remote XSS surface) inside Electron.

Packaged identity: no Alice/Bob role; `userData` is `~/.config/getnowhere`;
single-instance lock; per-launch bridge token. Older pre-release data under
`~/.config/getnowhere-desktop-alice` is orphaned (no migration) — remove manually
if present.

## Repo setup (once)

1. **Settings → Pages → Source = GitHub Actions** (browser / mobile web only)

## Vite `base`

Production build keeps `base: "./"` in `vite.config.ts` so assets work from:

- GitHub project Pages (`/repo/`)
- custom domain root
- packaged Electron `file://` (`resources/ui/`)

Do not switch to absolute `/` unless you only ever host at domain root.

## GitHub Pages workflow

Triggers: push to `main`, or manual `workflow_dispatch`. Does **not** run on version tags.

- Job `test`: Node 24, `npm ci`, `npm run test` (Vitest)
- Job `pages` (`needs: test`): `npm ci`, `npm run build` — skipped if tests fail
- Uploads `dist/` via `upload-pages-artifact`
- Deploys with `deploy-pages` (environment `github-pages`)

## Release Electron + sidecar workflow

Triggers: `v*` tags, or manual `workflow_dispatch`. Independent of the Pages workflow.

- `runs-on: ubuntu-24.04`
- Root `npm ci` + `npm run build` → `dist/`
- Stages `dist/` → `resources/ui`, sidecar + official Node via `desktop-electron/scripts/prepare-sidecar.mjs`
- Syncs `desktop-electron` package version from the tag (`v0.1.2` → `0.1.2`) so Forge artifact names include it
- `electron-forge make` → `.zip` + `.deb` under `desktop-electron/out/make`
- Uploads CI artifacts as `getnowhere-linux-desktop-<version>`; on `v*` tags creates a **draft** GitHub Release with checksums
- Manual dispatch without a tag still builds and uploads artifacts (version `<package.json>-ci.<short-sha>`); it does not create a release

Packaged UI path: `process.resourcesPath/ui/index.html` (`loadFile`). Override with `GNH_UI_URL` if needed.

## Install / run (user)

1. Download the `.deb` or `.zip` from the draft release / Actions artifact.
2. Install or extract and run `getnowhere`.
3. App starts Electron, spawns sidecar on an ephemeral loopback port, loads
   embedded UI, and talks to that private bridge (not a fixed `7901`).

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

Artifacts: `desktop-electron/out/make/deb/x64/*.deb` and `…/zip/linux/x64/*.zip`.

Desktop icon: `desktop-electron/icons/icon.png` (128×128), wired in `forge.config.cjs` for packager + `.deb`.

## Out of scope here

- Windows/macOS Forge makers
- nexe single-file sidecar
- `getnowhere.im` DNS / `public/CNAME` until confirmed

## Related

- `docs/architecture/electron-desktop.md`
- `docs/architecture/holepunch-sidecar.md`
- `docs/architecture/web-vs-wrapper.md`
