# The demo WordPress, with the connector plugin baked in.
#
# The plugin used to arrive as a bind mount of ./wp-claude-bridge.php. That
# works when compose runs from a checkout of this repository and fails silently
# everywhere else: Coolify runs compose from its own application directory,
# which holds the rendered compose file and nothing else, so the source path did
# not exist — and Docker's response to a missing bind source is to CREATE it, as
# a directory. WordPress then saw a plugin folder containing a directory named
# wp-claude-bridge.php and loaded nothing. No error, on either side. The demo
# site existed, answered on its domain, and had no plugin at all.
#
# Copying the plugin in at build time removes the dependency on where compose is
# run from, so the demo behaves the same locally and on any host.
FROM wordpress:6.6-php8.2-apache

COPY wp-claude-bridge.php /usr/src/plugin/wp-claude-bridge.php
COPY skills /usr/src/plugin/skills

# /var/www/html is a named volume, so anything written into it at build time is
# hidden the moment the volume mounts. The plugin is therefore staged outside
# the volume and copied in on each start, which also means a rebuilt image
# updates the plugin on an existing demo rather than leaving the first version
# in place forever.
COPY deploy/demo-entrypoint.sh /usr/local/bin/demo-entrypoint.sh
RUN chmod +x /usr/local/bin/demo-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/demo-entrypoint.sh"]
CMD ["apache2-foreground"]
