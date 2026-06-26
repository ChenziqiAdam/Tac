#!/usr/bin/env bash
# Generate assets/icon.icns from assets/icon.png using macOS built-ins
# (sips + iconutil). No npm dependencies required.
#
# Source icon.png should be at least 512x512. The 1024 slot is upscaled from
# 512 if the source is exactly 512x512, which is acceptable for v0.1.
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/icon.png"
ICONSET="assets/icon.iconset"
OUT="assets/icon.icns"

if [ ! -f "$SRC" ]; then
  echo "error: $SRC not found" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# size : output filename
gen() {
  sips -z "$1" "$1" "$SRC" --out "$ICONSET/$2" >/dev/null
}

gen 16   icon_16x16.png
gen 32   icon_16x16@2x.png
gen 32   icon_32x32.png
gen 64   icon_32x32@2x.png
gen 128  icon_128x128.png
gen 256  icon_128x128@2x.png
gen 256  icon_256x256.png
gen 512  icon_256x256@2x.png
gen 512  icon_512x512.png
gen 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"

echo "Wrote $OUT"
