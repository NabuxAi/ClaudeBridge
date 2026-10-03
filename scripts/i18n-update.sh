#!/usr/bin/env bash
# ============================================================
# Regenerate the plugin's translation template and refresh every catalog.
#
#   languages/wp-claude-bridge.pot        <- extracted from wp-claude-bridge.php
#   languages/wp-claude-bridge-<loc>.po   <- msgmerge'd against the new template
#   languages/wp-claude-bridge-<loc>.mo   <- compiled, committed next to the .po
#
# Run it after changing any user-facing string in the canonical plugin, then
# translate the new/fuzzy entries in each .po and run it again to recompile.
#
# The .mo files are committed rather than built at release time so that the
# release scripts do not need GNU gettext on the build machine. Both release
# scripts copy the committed .mo and, when msgfmt is available, refuse to ship
# a .mo that no longer matches its .po.
#
# Requires GNU gettext (xgettext, msgmerge, msgfmt) — on macOS:
#   brew install gettext
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/wp-claude-bridge.php"
LANG_DIR="$ROOT/languages"
DOMAIN="wp-claude-bridge"
VER=$(grep -oE "CB_VERSION', '[0-9.]+'" "$SRC" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1)

mkdir -p "$LANG_DIR"
POT="$LANG_DIR/$DOMAIN.pot"

# --add-location=file keeps file references but drops line numbers, so an edit
# elsewhere in the 8000-line plugin does not rewrite every catalog.
( cd "$ROOT" && xgettext --language=PHP --from-code=UTF-8 \
	--keyword=__ --keyword=_e --keyword=esc_html__ --keyword=esc_html_e \
	--keyword=esc_attr__ --keyword=esc_attr_e --keyword=_n:1,2 --keyword=_x:1,2c \
	--add-comments=translators --add-location=file --sort-output \
	--package-name="WP Claude Bridge" --package-version="$VER" \
	--copyright-holder="DigiWP" \
	--msgid-bugs-address="https://ai.digiwp.com" \
	-o "$POT" "$(basename "$SRC")" )

shopt -s nullglob
for po in "$LANG_DIR/$DOMAIN"-*.po; do
	msgmerge --quiet --update --backup=none --add-location=file --sort-output "$po" "$POT"
	msgfmt --check --output-file="${po%.po}.mo" "$po"
	echo "OK  $(basename "$po") -> $(basename "${po%.po}.mo")  ($(msgfmt --statistics -o /dev/null "$po" 2>&1))"
done
echo "OK  $(basename "$POT")  ($(grep -c '^msgid ' "$POT") entries incl. header)"
