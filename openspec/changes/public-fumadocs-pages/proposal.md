# Public Fumadocs site on GitHub Pages

## Why

Get NowHere needs a curated public documentation site that can be hosted on
GitHub Pages. The existing `docs/` tree is an internal engineering knowledge
base and must not be published automatically.

## What Changes

- Add an isolated Next.js / Fumadocs site under `documentation/website/`.
- Add curated public MDX under `documentation/content/` only.
- Repurpose `.github/workflows/github-pages.yml` to deploy that static export
  (not the root Vite application).
- Document the `docs/` vs `documentation/` boundary in the root README and
  `docs/README.md`.
- **BREAKING** for GitHub Pages: the Pages site will serve public docs instead
  of the Vite UI `dist/` bundle.

## Capabilities

### New Capabilities

- `public-documentation`: curated public docs content, isolated Fumadocs
  renderer, and GitHub Pages static deployment.

### Modified Capabilities

_(none)_

## Impact

- New top-level `documentation/` directory
- `.github/workflows/github-pages.yml`
- Root `README.md`, `docs/README.md`, folder-structure and Pages build docs
- Root `.gitignore` / Biome ignore for generated Next output
- No changes to the Vite app, Electron, native-wrapper, sidecar, Android, or
  Electron release workflows
