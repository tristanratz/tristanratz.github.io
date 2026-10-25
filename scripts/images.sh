#!/bin/sh
# Converts the project images to WebP: a large version (max. 900 px wide) for cards
# and the detail view, and a small thumbnail for the similarity map.
# The JPGs stay for social previews (og:image). Needs cwebp (brew install webp).
set -e
cd "$(dirname "$0")/../public/img"
mkdir -p thumbs
for f in *.jpg; do
  [ "$f" = "tristan-ratz.jpg" ] && continue
  name="${f%.jpg}"
  width=$(sips -g pixelWidth "$f" | awk '/pixelWidth/ {print $2}')
  resize=""; [ "$width" -gt 900 ] && resize="-resize 900 0"
  cwebp -quiet -q 75 -m 6 $resize "$f" -o "$name.webp"
  cwebp -quiet -q 75 -m 6 -resize 128 0 "$f" -o "thumbs/$name.webp"
done
