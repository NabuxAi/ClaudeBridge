#!/usr/bin/env bash
# ============================================================
# Build the WordPress.org variant of the bridge.
#
# Same plugin, same code, three deliberate differences from the
# self-hosted DigiWp build:
#
#   1. No self-updater. A directory-hosted plugin takes its updates from
#      the directory; shipping a second update channel is grounds for
#      rejection, and a plugin answering both would fight itself over which
#      version is current. Stripped between the wporg:strip markers in the
#      canonical source.
#
#   2. No bundled skills/. Plugin Check rejects the package outright —
#      "Application files are not permitted" — because 75 markdown documents
#      and sample config files are payload, not plugin code. The skills are
#      still available to a connected model from the server side.
#
#   3. A name and slug with no "wp" in them. Plugin Check: "the restricted
#      term 'wp' ... cannot be used at all in your plugin name" — and the
#      slug is permanent once approved, so it is worth getting right.
#
# The self-hosted build is unaffected: scripts/build-digiwp-ai-bridge.sh
# still produces it, updater and skills included.
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/wp-claude-bridge.php"

# Change these two together. SLUG becomes the permanent wordpress.org URL.
NAME="${WPORG_NAME:-Digi Ai Bridge}"
SLUG="${WPORG_SLUG:-digi-ai-bridge}"

OUT="$ROOT/dist/$SLUG"
ZIP="$ROOT/dist/$SLUG.zip"

case "$SLUG" in
	*wp*|*WP*|*wordpress*)
		echo "refusing to build: slug '$SLUG' contains a restricted term" >&2
		exit 1 ;;
esac
case "$NAME" in
	*[Ww][Pp]*|*[Ww]ord[Pp]ress*)
		echo "refusing to build: name '$NAME' contains a restricted term" >&2
		exit 1 ;;
esac

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

VER=$(grep -oE "CB_VERSION', '[0-9.]+'" "$SRC" | grep -oE "[0-9]+\.[0-9]+\.[0-9]+" | head -1)

# 1) Strip the updater, rebrand, and drop the competitor mention from the
#    description — naming another product in your own listing is a guideline
#    problem, and it reads as marketing rather than description anyway.
NAME="$NAME" perl -0777 -pe '
  s{/\* wporg:strip-start.*?/\* wporg:strip-end \*/}{}gs;
  s/Plugin Name: WP Claude Bridge/Plugin Name: $ENV{NAME}/;
  s/^ \* Author: .*/ * Author: DigiWP/m;
  s/ Free alternative to WPVibe\.//;
  s/\x27Claude Bridge\x27/\x27$ENV{NAME}\x27/g;
' "$SRC" > "$OUT/$SLUG.php"

# 2) readme.txt — the real one. The self-hosted build ships a four-line note
#    because nobody parses it; the directory does, and a missing Stable Tag or
#    License header fails before a human ever looks at the code.
cat > "$OUT/readme.txt" <<TXT
=== $NAME ===
Contributors: nabuxai
Tags: mcp, ai, remote management, rest api, automation
Requires at least: 5.9
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: $VER
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Lets an AI assistant manage this site over MCP, using WordPress's own
revocable Application Passwords.

== Description ==

Turns this site into a self-hosted MCP server so a connected AI assistant can
do real work on it: read and edit theme and plugin files, create plugins,
activate themes, preview a draft theme, flush caches, and reach the whole
WordPress and WooCommerce REST surface through a single proxied endpoint.

Access is through WordPress's own **Application Passwords** — revocable per
application, from the user's own profile screen, with no password shared and
nothing stored by this plugin that cannot be revoked in one click. A static
bearer token is available as an alternative for automation that cannot do
OAuth.

Because a host or a security layer will sometimes block one transport, the
plugin answers on several: the REST API, admin-ajax, and a query variable, in
either JSON or SSE. If one path is closed, another usually is not.

**Connector mode** is the stricter setting, and off by default. With it on,
the site stops accepting direct requests entirely and will only act on
commands signed by a server you have paired it with (HMAC-SHA256 over the
timestamp and raw body). Nothing happens on the site directly; everything goes
through your own server.

== External services ==

Out of the box this plugin contacts nothing. It has no bundled endpoint, and
every outbound request below happens only after you have entered a server URL
yourself.

**Connector mode**, when you enable it and paste a server URL and shared
secret: the site accepts signed commands from that server and returns the
results. What travels is whatever the command asked for — file contents, post
and product data, WooCommerce orders, site and plugin inventory. That is the
purpose of the pairing, and it is why the mode is off until you turn it on.

Because you choose the server, its operator — not this plugin — decides how
that data is stored and retained. If someone else runs the instance you are
pairing with, ask for their terms and privacy policy before connecting a
production site.

Nothing is sent on a schedule and this plugin collects no analytics.

== Installation ==

1. Install and activate.
2. Go to Tools → $NAME.
3. Either create an Application Password for your AI client, or turn on
   Connector Mode and paste the server URL and shared secret from your panel.

== Frequently Asked Questions ==

= Does this give an AI write access to my site? =

Yes — that is what it is for, and you should treat it that way. It can edit
theme and plugin files and create plugins. Grant it to a client you trust,
use an Application Password so you can revoke it in one click, and prefer
Connector Mode if you want every action to go through a server you control.

= What happens if I revoke the Application Password? =

Access stops immediately. Nothing is cached that would keep working.

= Do I need a DigiWP account? =

No. The plugin works standalone with an Application Password. Connector Mode
is for people who want to drive many sites from one panel.

== Changelog ==

= $VER =
* First WordPress.org release.
TXT

# 3) Package. Top-level folder must be the slug.
( cd "$ROOT/dist" && zip -qr "$ZIP" "$SLUG" -x '*.DS_Store' )

php -l "$OUT/$SLUG.php" >/dev/null

# The strip is the whole point of this build; fail loudly rather than ship a
# package that still carries an update channel.
for needle in cb_inject_update cb_update_manifest cb_auto_update pre_set_site_transient_update_plugins; do
	if grep -q "$needle" "$OUT/$SLUG.php"; then
		echo "FAIL: '$needle' survived the strip" >&2
		exit 1
	fi
done
# Only the header matters here. A factual comment further down about how
# another plugin structures something is developer context, not marketing, and
# stripping it would cost a reader the reason the code looks the way it does.
if sed -n '1,20p' "$OUT/$SLUG.php" | grep -q 'WPVibe'; then
	echo "FAIL: competitor name still in the plugin header" >&2
	exit 1
fi

echo "OK  $OUT/$SLUG.php  (v$VER, syntax valid, updater stripped)"
echo "ZIP $ZIP  ($(du -h "$ZIP" | cut -f1))"
