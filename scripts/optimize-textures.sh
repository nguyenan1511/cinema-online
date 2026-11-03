#!/bin/sh
# Poly Haven CC0 sources (assets-src/polyhaven, 1K) -> web copies in public/tex and public/env.
# Colour maps stay 1024px; normal + ARM (AO/rough/metal) maps drop to 512px. Uses macOS `sips`.
set -e
SRC=assets-src/polyhaven
mkdir -p public/tex public/env
for f in "$SRC"/*.jpg; do
  name=$(basename "$f")
  case "$name" in
    *_Diffuse.jpg) size=1024; q=72 ;;
    *) size=512; q=70 ;;
  esac
  sips -s format jpeg -s formatOptions "$q" -Z "$size" "$f" --out "public/tex/$name" >/dev/null
done
cp "$SRC"/*.hdr public/env/
cp "$SRC"/LICENSE.txt public/tex/LICENSE-PolyHaven.txt
du -sh public/tex public/env
