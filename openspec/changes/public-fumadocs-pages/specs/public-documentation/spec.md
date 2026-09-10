# Public documentation

## ADDED Requirements

### Requirement: Isolated public documentation source

The repository SHALL keep public documentation in `documentation/content/`
and SHALL NOT automatically publish, move, rename, delete, or convert the
internal `docs/` tree for GitHub Pages.

#### Scenario: Internal docs stay private

- **WHEN** the documentation site is built
- **THEN** only files under `documentation/content/` are included as published
  pages
- **AND** `docs/prompts/`, decision records, build notes, and raw security
  notes are not copied into the public tree

### Requirement: Isolated Fumadocs renderer

The public site SHALL be a separate Next.js / Fumadocs application under
`documentation/website/` that statically exports all routes.

#### Scenario: Local development uses the site root

- **WHEN** a developer runs the documentation site locally
- **THEN** it is served at `http://localhost:3000/` without a `/getnowhere`
  prefix

#### Scenario: GitHub Actions uses the project Pages base path

- **WHEN** the site is built with `GITHUB_ACTIONS` set to `"true"`
- **THEN** Next.js uses `basePath: "/getnowhere"` and
  `assetPrefix: "/getnowhere/"`
- **AND** generated HTML does not reference root-absolute `/_next/` assets

### Requirement: GitHub Pages workflow deploys only public docs

`.github/workflows/github-pages.yml` SHALL deploy
`documentation/website/out` and SHALL NOT deploy the root Vite `dist/`.

#### Scenario: Unrelated application changes do not deploy docs

- **WHEN** a push to `main` changes only application, Android, Electron,
  sidecar, test, or internal `docs/**` files
- **THEN** the documentation Pages workflow does not run

#### Scenario: Docs changes deploy through GitHub Actions

- **WHEN** a push to `main` changes `documentation/**` or
  `.github/workflows/github-pages.yml`, or a maintainer dispatches the
  workflow
- **THEN** the workflow builds the documentation site and deploys the
  uploaded `documentation/website/out` artifact through a dependent
  deploy job
