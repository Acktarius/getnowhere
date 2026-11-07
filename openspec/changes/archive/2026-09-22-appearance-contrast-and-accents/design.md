## Context

See proposal.md for motivation. Appearance is CSS variables plus
`useApplyTheme`: `data-theme` is `dark` or `light`; accent maps overwrite
`--primary` and related vars on `:root`. Accents persist as `gnh.settings.accent`.
Chat-topic glyphs are a CSS mask in `.chat-topic-backdrop` filled with a
`color-mix` of `--primary`.

## Goals / Non-Goals

**Goals:**

- Dark charcoal page `#3d4558`; tiles keep original `#14161d`. Sky and pink
  stay accent maps only.
- Sky and pink accent maps, with deeper Light primaries for button contrast.
- Stronger topic-glyph mix without redrawing SVGs.
- Tests that fail if tokens, mix, or swatches are missing.

**Non-Goals:**

- Per-accent page tint or extra page themes.
- Recoloring existing teal / blue / amber / violet Light maps.
- New storage keys or migrations.

## Decisions

### 1. Token-only surfaces

Keep tokens in `global.css`. Dark: `--bg` `#3d4558` (charcoal page). Tiles
keep the original stack: `--bg-card` `#14161d`, `--bg-elev` `#11131a`,
`--bg-elev-2` `#161922`, hover/press `#1b1e28` / `#21252f`. Light
cards stay white; recessed `--bg-elev-2` is `#dcdfe6`. Accent maps never write
`--bg` or `--bg-card`.

**Alternative:** Extra wallpaper layer — same look, more code. Rejected.

### 2. Extract accent maps for tests

Move accent palettes to a small module (e.g. `src/lib/appearance/accentVars.ts`)
keyed by accent and resolved theme (`dark` | `light`). `useApplyTheme` applies
the map. Tests assert sky/pink hex without mounting CSS.

**Alternative:** Keep maps inline in the hook — harder to assert Light variants.

### 3. Light variants for sky and pink only

Existing accents keep today’s single map. New accents use a Light row so pink
and sky stay readable on white buttons.

### 4. Naming

Accent ids `sky` and `pink`. Labels **Sky** and **Pink**. No other product name
for pink.

### 5. Persistence

Same `gnh.settings.accent`. Unknown values already fall back to teal; add
`sky` and `pink` to the type. No migration.

## Risks / Trade-offs

- [Dark card cascade looks too “grey”] → Stick to the agreed hex table; tune
  only if operator review says so.
- [Topic glyphs become loud] → 24%/16% is the spec; do not raise further
  without a change update.
- [Accent maps ignore Light for old accents] → Accepted; out of scope.

## Migration Plan

- No storage migration.
- Rollback: revert the CSS/token and accent-map commits; stored `sky`/`pink`
  fall back to teal on older builds.

## Open Questions

None.
