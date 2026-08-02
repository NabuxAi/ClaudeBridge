#!/usr/bin/env bash
# Install the connector plugin into the demo site, then hand over to WordPress.
#
# /var/www/html is a named volume: whatever the image put there at build time is
# masked as soon as the volume mounts, and on an existing demo the volume is
# already populated from an older image. So the plugin is staged at
# /usr/src/plugin and copied in here, on every start — which keeps a rebuilt
# image and a running demo in step instead of freezing whatever version
# happened to be installed first.
set -euo pipefail

PLUGIN_DIR=/var/www/html/wp-content/plugins/wp-claude-bridge
STAGE=/usr/src/plugin

install_plugin() {
  # The upstream entrypoint populates /var/www/html on first boot; wait for it
  # so the plugin is not written into a directory WordPress is about to fill.
  for _ in $(seq 1 60); do
    [ -f /var/www/html/wp-settings.php ] && break
    sleep 1
  done

  # An earlier deployment left a DIRECTORY named wp-claude-bridge.php here,
  # created by Docker when it could not find the bind-mount source. Remove it,
  # or the copy below fails and the demo keeps running with no plugin.
  rm -rf "${PLUGIN_DIR}"
  mkdir -p "${PLUGIN_DIR}"
  cp "${STAGE}/wp-claude-bridge.php" "${PLUGIN_DIR}/wp-claude-bridge.php"
  cp -r "${STAGE}/skills" "${PLUGIN_DIR}/skills"
  chown -R www-data:www-data "${PLUGIN_DIR}"

  echo "demo: installed wp-claude-bridge into ${PLUGIN_DIR}"
}

# In the background: the upstream entrypoint has to run for wp-settings.php to
# exist, and it is what ultimately execs Apache.
install_plugin &

exec docker-entrypoint.sh "$@"
