#!/bin/bash
# Generate the document type icon from the website SVG logo.
# Usage: ./generate-doc-icon.sh
# Requires: ImageMagick 7 (magick)
# Expects: ../nubium-website/dist/logo.svg (the Nubium logo)

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
LOGO="$REPO/../nubium-website/dist/logo.svg"
OUT="$DIR/doc-icon.png"

if [ ! -f "$LOGO" ]; then
  echo "Error: logo not found at $LOGO"
  echo "Clone nubium-website next to nubium and build it first."
  exit 1
fi

# Rasterize SVG logo and place on white rounded page
magick -background "rgb(11,16,31)" -density 300 "$LOGO" -resize 200x200 /tmp/_nubium-logo.png
magick -size 512x512 xc:none \
  -fill white -draw "roundrectangle 86,36 426,476 16,16" \
  /tmp/_nubium-logo.png -gravity center -geometry +0-20 -composite \
  PNG32:"$OUT"
rm -f /tmp/_nubium-logo.png

echo "Generated $OUT"
