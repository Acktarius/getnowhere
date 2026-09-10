# Design: public Fumadocs documentation

## Context

The root application stays Vite. Public docs are a separate static Next.js
app. Internal `docs/` remains unpublished.

## Goals / Non-Goals

**Goals**

- Static export that works locally at `/` and on Pages under `/getnowhere/`.
- Public-safe, concise content fact-checked against code and internal docs.
- Deploy only when `documentation/**` or the Pages workflow changes.

**Non-Goals**

- Publishing, mirroring, or converting `docs/`.
- Adding Fumadocs to the root application package.
- Server routes, databases, or secret-backed search.
- Changing Android signing or Electron/sidecar release behavior.

## Decisions

- Content lives in `documentation/content/`; the renderer lives in
  `documentation/website/`.
- `output: "export"` + `trailingSlash: true`.
- `basePath` / `assetPrefix` only when `GITHUB_ACTIONS === "true"`.
- Search only if it is fully static (client-side index); otherwise omit it.
- Node 24 to match existing workflows.
- Official Pages actions; no PAT; no `gh-pages` branch.

## Risks / Tradeoffs

- Replacing the existing Pages Vite deploy is intentional and breaking for
  anyone who used Pages as a hosted UI.
- Static export cannot use server search handlers.
- Public security pages must stay high-level and must not copy protocol
  internals.

## Migration Plan

After merge: set GitHub Pages source to GitHub Actions, then dispatch or
push a docs change.
