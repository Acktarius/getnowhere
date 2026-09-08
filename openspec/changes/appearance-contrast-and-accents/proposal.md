# Appearance contrast and accents

## Why

Dark mode is near-black and light mode is near-white, so the app feels like one
flat slab. Chat-topic glyphs on the room backdrop are too faint to read. Users
also need two more accent colors: sky and pink.

## What Changes

- Lift Dark and Light **page** backgrounds so the shell is easier on the eyes.
  Dark cards move one small step up so they stay lighter than the page.
- Raise chat-topic glyph contrast (same mask, stronger accent mix).
- Add **sky** and **pink** as **accents only** (buttons, highlights, topic
  glyphs). They MUST NOT become page themes or tint `--bg` / `--bg-card`.
  Dark / Light / System stay the only page themes.
- Document theme vs accent and the surface tokens.

## Capabilities

### New Capabilities

- `app-appearance`: page themes, accent list (including sky and pink), surface
  contrast, and chat-topic backdrop visibility.

### Modified Capabilities

_(none)_

## Impact

- CSS surface tokens and topic-backdrop mix in `src/styles/global.css`
- Accent maps and light-mode variants for sky/pink in `useApplyTheme`
- `AccentName` + Settings → Appearance swatches
- `docs/features/appearance.md` + README link
- No protocol, storage-key, or native-bridge changes (`gnh.settings.accent` unchanged)
