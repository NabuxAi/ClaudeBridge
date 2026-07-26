#!/usr/bin/env bash
# ============================================================
# Build the "DigiWp Ai Bridge" distributable plugin from the
# canonical wp-claude-bridge.php. It is the SAME plugin, only
# re-branded and pre-pointed at api.digiwp.com so a site owner
# just installs it, turns on Connector Mode, and pastes the
# shared secret from the panel. The internal REST namespace
# (claude-bridge/v1) and HMAC scheme are kept UNCHANGED so the
# DigiWp server (api.digiwp.com) drives it with no other change.
#
# Output:
#   dist/digiwp-ai-bridge/            (the plugin folder)
#   hub/public/digiwp-ai-bridge.zip   (served at ai.digiwp.com/digiwp-ai-bridge.zip)
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/wp-claude-bridge.php"
SERVER_URL="https://api.digiwp.com/v1"
SLUG="digiwp-ai-bridge"
OUT="$ROOT/dist/$SLUG"
ZIP="$ROOT/hub/public/$SLUG.zip"

rm -rf "$ROOT/dist/$SLUG" "$ZIP"
mkdir -p "$OUT" "$ROOT/hub/public"

# 1) Copy + rebrand the main plugin file. (\x27 = single quote; keeps the perl program
#    single-quoted so the shell never mangles it. Server URL comes via the environment.)
SERVER_URL="$SERVER_URL" perl -pe '
  s/Plugin Name: WP Claude Bridge/Plugin Name: DigiWp Ai Bridge/;
  s/^ \* Author: .*/ * Author: DigiWP/;
  s/\x27Claude Bridge\x27/\x27DigiWp Ai Bridge\x27/g;
  s/\x27enabled\x27 => false, \x27server_url\x27 => \x27\x27/\x27enabled\x27 => false, \x27server_url\x27 => \x27$ENV{SERVER_URL}\x27/;
' "$SRC" > "$OUT/$SLUG.php"

# 2) Ship the bundled skills (same as the source plugin).
if [ -d "$ROOT/skills" ]; then
  cp -R "$ROOT/skills" "$OUT/skills"
fi

# 3) A short readme so the zip is self-describing.
cat > "$OUT/readme.txt" <<'TXT'
=== DigiWp Ai Bridge ===
Connects this WordPress site to the DigiWP panel (ai.digiwp.com) through the
DigiWP server (api.digiwp.com). Install, activate, then Tools → DigiWp Ai Bridge →
Hub Connector Mode: turn it on and paste the shared secret from your panel.
The server URL is pre-filled. From then on the site only accepts signed commands
from your DigiWP server.
TXT

# 4) Zip it (top-level folder = the slug, as WordPress expects).
( cd "$ROOT/dist" && zip -qr "$ZIP" "$SLUG" )

# 5) Emit the update manifest the server serves at /v1/plugin/manifest.
#    Version is read from the canonical plugin so it is always in sync with the zip.
VER=$(grep -oE "CB_VERSION', '[0-9.]+'" "$SRC" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1)
cat > "$ROOT/server/plugin-manifest.json" <<JSON
{
  "name": "DigiWp Ai Bridge",
  "slug": "$SLUG",
  "version": "$VER",
  "download_url": "https://ai.digiwp.com/$SLUG.zip",
  "homepage": "https://ai.digiwp.com",
  "tested": "6.7"
}
JSON

php -l "$OUT/$SLUG.php" >/dev/null && echo "OK: $OUT/$SLUG.php (syntax valid)"
echo "ZIP: $ZIP  ($(du -h "$ZIP" | cut -f1))"
echo "Manifest: server/plugin-manifest.json (version $VER)"
echo "Default server URL baked in: $SERVER_URL"
