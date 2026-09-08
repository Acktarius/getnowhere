## 1. Surface tokens

- [x] 1.1 Add tests that fail unless Dark `--bg`/`--bg-card` and Light `--bg` match the spec hex, and `.chat-topic-backdrop` uses 24% / 16% primary mix.
- [x] 1.2 Update `global.css` Dark/Light surface tokens (page first; Dark cards one step up) and raise the topic-backdrop mix to 24% / 16%.

## 2. Accents

- [x] 2.1 Add tests that fail unless sky/pink define Dark and Light `--primary` hex, unknown accents resolve to teal, and ThemeSelector lists Sky and Pink (not extra page themes).
- [x] 2.2 Extract accent maps (theme-aware for sky/pink only), extend `AccentName`, and apply them from `useApplyTheme`.
- [x] 2.3 Add Sky and Pink swatches on Settings → Appearance; wrap the accent row; labels are Sky and Pink only.

## 3. Docs

- [x] 3.1 Add `docs/features/appearance.md` (theme vs accent, token table, glyph mix) and link it from `docs/README.md`. Copy uses Pink and Sky only.

## 4. Product loop

- [x] 4.1 Confirm `e2e.json` drives the appearance tests and typecheck; run `forge e2e run` green.
