# Appearance

**Status:** Implemented. Settings → Appearance.

Page theme and accent are independent. Themes are Dark, Light, and System only.
Accents (Teal, Blue, Amber, Violet, Sky, Pink) change the primary highlight —
buttons, focus, and chat-topic glyphs — not the page. **Sky and Pink are
accents only; they do not tint the page** or card surfaces.

`data-theme` on the document is `dark` or `light`. System follows the host
color scheme and then resolves to one of those two. Accent maps overwrite
`--primary` and related vars on `:root`. They never write `--bg` or `--bg-card`.

## Theme vs accent

| Control | Choices | What it changes |
|---|---|---|
| **Theme** | Dark, Light, System | Page and card surfaces (`--bg`, `--bg-card`, and the elev/hover/press cascade). |
| **Accent** | Teal, Blue, Amber, Violet, Sky, Pink | `--primary` and related highlight vars. |

There is no Sky or Pink page theme. Unknown stored accents fall back to teal.
Accent persists as `gnh.settings.accent` (no new storage key).

UI labels and this doc name the new accents **Sky** and **Pink** only.

## Surface tokens

Accent maps never write these.

| Token | Dark | Light |
|---|---|---|
| `--bg` (page) | `#3d4558` | `#e6e8ee` |
| `--bg-card` | `#14161d` (original) | `#ffffff` |
| `--bg-elev` | `#11131a` (original) | `#ffffff` |
| `--bg-elev-2` | `#161922` (original) | `#dcdfe6` |
| `--bg-hover` | `#1b1e28` (original) | `#f0f2f6` |
| `--bg-press` | `#21252f` (original) | `#e6e9ef` |

Primary text stays light on Dark cards and dark on Light cards.

## Sky and Pink primaries

Sky and Pink use a deeper Light `--primary` so buttons stay readable on white.
Existing Teal / Blue / Amber / Violet maps are unchanged.

| Accent | Dark `--primary` | Light `--primary` |
|---|---|---|
| Sky | `#6ec8f0` | `#2b9fd4` |
| Pink | `#ff8fb8` | `#e85a8c` |

## Chat-topic glyphs

`.chat-topic-backdrop` keeps the tiled topic-glyph mask. Fill is a `color-mix`
of the current `--primary`:

| Theme | Mix |
|---|---|
| Dark | 24% |
| Light | 16% |

Do not raise the mix without a spec change.

## Related code

| Area | Location |
|---|---|
| Surface tokens + glyph mix | `src/styles/global.css` |
| Accent maps | `src/lib/appearance/accentVars.ts` |
| Apply theme / accent | `src/hooks/useApplyTheme.ts` |
| Settings swatches | `src/components/ThemeSelector.tsx` |
