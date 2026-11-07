# Tasks

## 1. Isolated Fumadocs site

- [x] 1.1 Add `documentation/website/` with Fumadocs/Next.js static-export config
- [x] 1.2 Point the content source at `documentation/content/`
- [x] 1.3 Add `dev`, `build`, `typecheck`, and `lint` scripts

## 2. Public content

- [x] 2.1 Write the required public MDX pages and `meta.json`
- [x] 2.2 Label unverified claims as planned/proposed and keep security pages high-level

## 3. Pages workflow and repo docs

- [x] 3.1 Repurpose `.github/workflows/github-pages.yml` for the docs site
- [x] 3.2 Update README, `docs/README.md`, folder-structure, and Pages build notes
- [x] 3.3 Ignore generated Next/Fumadocs output and keep root Biome off the site

## 4. Validation

- [x] 4.1 Install website deps and build in GitHub Pages mode
- [x] 4.2 Confirm `out/index.html` exists and assets are not root-absolute `/_next/`
