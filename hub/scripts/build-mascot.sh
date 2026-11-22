#!/bin/sh
# Builds src/vendor/digi-mascot.js: Digi, the DigiWP guardian (mascot/digiForm.ts), with the
# vendored anidoodle interactive host (mascot/engine, Apache-2.0). Run after changing mascot/.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
"$here/node_modules/.bin/esbuild" "$here/mascot/entry.ts" --bundle --minify --format=esm --target=es2020 \
  --banner:js="/* Digi, the DigiWP mascot. Built by scripts/build-mascot.sh from mascot/. Includes the anidoodle interactive host, Apache-2.0 (https://github.com/alexgreensh/anidoodle). */" \
  --outfile="$here/src/vendor/digi-mascot.js"
