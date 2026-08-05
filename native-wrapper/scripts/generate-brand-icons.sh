#!/usr/bin/env bash
# Render launcher icons from repo-root public/icon.svg (BrandMark). Requires ImageMagick.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/../public/icon.svg"
OUT="$ROOT/assets"
# Android adaptive icons mask to circle/squircle; keep art inside ~66% safe zone.
ADAPTIVE_SAFE_PX=620

if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi
if ! command -v convert >/dev/null 2>&1; then
  echo "Install ImageMagick (convert)" >&2
  exit 1
fi
mkdir -p "$OUT"

MARK_SRC="$(mktemp --suffix=.svg)"
trap 'rm -f "$MARK_SRC"' EXIT
# Foreground: rings + mark only (tile color comes from adaptive background).
sed '/<rect width="512"/d' "$SRC" > "$MARK_SRC"

# Full brand tile (PWA, iOS, non-adaptive)
convert -background none "$SRC" -resize 1024x1024 "$OUT/icon.png"

# Adaptive foreground — scaled down so outer ring survives launcher crop
convert -background none "$MARK_SRC" -resize "${ADAPTIVE_SAFE_PX}x${ADAPTIVE_SAFE_PX}" \
  -gravity center -extent 1024x1024 "$OUT/android-icon-foreground.png"

# Adaptive background — matches SVG tile / --bg-elev-2
convert -size 1024x1024 xc:'#161922' "$OUT/android-icon-background.png"

# Themed / monochrome launcher (Android 13+), same safe-zone scale
convert -background none "$MARK_SRC" -resize 260x260 \
  -colorspace gray -fill white -colorize 100% \
  -gravity center -extent 432x432 "$OUT/android-icon-monochrome.png"

convert -background none "$SRC" -resize 48x48 "$OUT/favicon.png"
convert -background none "$MARK_SRC" -resize 200x200 \
  -gravity center -extent 288x288 "$OUT/splash-icon.png"
echo "Wrote brand icons in $OUT from $SRC (adaptive foreground at ${ADAPTIVE_SAFE_PX}px safe zone)"
