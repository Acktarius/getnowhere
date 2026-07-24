# GitHub Pages UI + Linux desktop (Electron + sidecar)

**One workflow, two jobs.** See `.github/workflows/pages-and-desktop.yml`.

```text
Job 1 — Pages          npm run build → dist/ → GitHub Pages
Job 2 — Desktop Linux  Electron Forge zip/deb
                         ├─ Electron shell
                         ├─ bundled Node (resources/runtime/node)
                         └─ holepunch-sidecar (resources/sidecar)
                              listens ws://127.0.0.1:7901
                         loads UI from Pages URL
```

Hyperswarm stays in the sidecar process. The Vite/Pages UI never imports it.

## Repo setup (once)

1. **Settings → Pages → Source = GitHub Actions**
2. Optional repo variable `GNH_PACKAGED_UI_URL` (e.g. `https://getnowhere.im/`) to override the default project Pages URL `https://<owner>.github.io/<repo>/`
3. Custom domain later: add `public/CNAME` only when DNS is ready (not required for Pages Actions)

## Vite `base`

Production build keeps `base: "./"` in `vite.config.ts` so assets work from:

- GitHub project Pages (`/repo/`)
- custom domain root
- optional future `file://` embedding

Do not switch to absolute `/` unless you only ever host at domain root.

## Job 1 — GitHub Pages

Triggers with the workflow (`main`, `v*` tags, `workflow_dispatch`).

- Node 24, `npm ci`, `npm run build`
- Uploads `dist/` via `upload-pages-artifact`
- Deploys with `deploy-pages` (environment `github-pages`)

## Job 2 — Electron + sidecar (Ubuntu)

Same workflow, independent of Job 1 success (UI is loaded at runtime from Pages).

- `runs-on: ubuntu-24.04`
- Stages sidecar + official Node linux binary via `desktop-electron/scripts/prepare-sidecar.mjs`
- `electron-forge make` → `.zip` + `.deb` under `desktop-electron/out/make`
- Uploads CI artifacts; on `v*` tags creates a **draft** GitHub Release with checksums

Packaged defaults (`resources/gnh-defaults.json`):

| Field | Meaning |
|---|---|
| `uiUrl` | Pages URL Electron loads (`GNH_UI_URL` overrides at runtime) |

## Install / run (user)

1. Open the Pages site once (confirm UI loads in a browser).
2. Download the `.deb` or `.zip` from the draft release / Actions artifact.
3. Install or extract and run `getnowhere`.
4. App starts Electron, spawns sidecar, opens Pages UI, talks to `ws://127.0.0.1:7901`.

Alice/Bob on one machine (dev): keep using `npm run desktop:alice` / `desktop:bob` with `npm run dev`.

## Local make (maintainer)

```bash
npm run holepunch:install
npm run desktop:install
GNH_PACKAGED_UI_URL=https://<owner>.github.io/<repo>/ npm run desktop:make
```

Artifacts: `desktop-electron/out/make/`.

## Out of scope here

- Windows/macOS Forge makers
- nexe single-file sidecar
- Baking UI into the AppImage (Pages URL is intentional)
- `getnowhere.im` DNS / `public/CNAME` until confirmed

## Related

- `docs/architecture/electron-desktop.md`
- `docs/architecture/holepunch-sidecar.md`
- `docs/architecture/web-vs-wrapper.md`
