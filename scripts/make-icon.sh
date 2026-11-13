#!/bin/sh
# Builds the macOS app icon (apps/desktop/resources/icon.icns) from the design
# renders in docs/design/icon (see its README): the simplified variant for
# 16 and 32 px, the full icon reduced for 128 px and more. macOS only (sips, iconutil).
set -eu
cd "$(dirname "$0")/.."
src=docs/design/icon
set_dir=$(mktemp -d)/charpentier.iconset
mkdir -p "$set_dir"
cp "$src/charpentier-16.png" "$set_dir/icon_16x16.png"
cp "$src/charpentier-32.png" "$set_dir/icon_16x16@2x.png"
cp "$src/charpentier-32.png" "$set_dir/icon_32x32.png"
cp "$src/charpentier-64.png" "$set_dir/icon_32x32@2x.png"
for size in 128 256 512; do
  sips -z $size $size "$src/charpentier-1024.png" --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$src/charpentier-1024.png" --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o apps/desktop/resources/icon.icns
echo "apps/desktop/resources/icon.icns"
