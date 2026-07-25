<?php
/**
 * Plugin Name: WP Claude Bridge
 * Description: Turns this WordPress site into a full self-hosted MCP server — edit theme AND plugin files, create plugins, activate themes/plugins, draft preview, cache flush, PLUS complete WordPress + WooCommerce control via a generic REST proxy. Connects to Claude via OAuth using WordPress's native, revocable Application Passwords, or a static Bearer token / token-in-URL. Bundles WordPress engineering skills the connected model can load on demand (as tools, MCP resources, and prompts), ships a cookbook of ready-to-paste recipes shown right on the WordPress Dashboard, and exposes several fallback connection modes (REST, admin-ajax, query-var; JSON or SSE) so it can still connect when a host or security layer blocks one path. Free alternative to WPVibe.
 * Version: 3.6.0
 * Author: Account City
 * License: GPLv2 or later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CB_VERSION', '3.6.0' );
define( 'CB_TOKEN_OPTION', 'cb_mcp_token' );
define( 'CB_PREVIEW_TRANSIENT', 'cb_preview_theme' );
define( 'CB_CLIENTS_OPTION', 'cb_oauth_clients' );
define( 'CB_CONNECTOR_OPTION', 'cb_connector' ); // Hub-connector pairing: server URL + shared secret.
define( 'CB_ACTIVITY_OPTION', 'cb_activity_log' );      // Ring buffer of recent tool calls.
define( 'CB_ACTIVITY_OPTION_ON', 'cb_activity_on' );    // "1" = log calls (default), "0" = off.
define( 'CB_ACTIVITY_MAX', 40 );                        // Entries kept.
define( 'CB_LASTSEEN_OPTION', 'cb_last_seen' );         // Unix time of the last authorized call.

/* ============================================================================
 * 1. PATH SANDBOX
 * ========================================================================== */

/** Resolve & sandbox a path inside a single theme directory. */
function cb_resolve_theme_path( $theme, $rel = '' ) {
	$theme = trim( (string) $theme );
	if ( $theme === '' || strpos( $theme, '..' ) !== false || strpos( $theme, '/' ) !== false ) {
		return new WP_Error( 'cb_bad_theme', 'Invalid theme slug.' );
	}
	$root = realpath( trailingslashit( get_theme_root( $theme ) ) . $theme );
	if ( ! $root || ! is_dir( $root ) ) {
		return new WP_Error( 'cb_no_theme', "Theme '$theme' not found." );
	}
	return cb_join_sandboxed( $root, $rel );
}

/** Resolve & sandbox a path relative to wp-content (themes, plugins, uploads…). */
function cb_resolve_content_path( $rel ) {
	return cb_join_sandboxed( realpath( WP_CONTENT_DIR ), $rel );
}

function cb_join_sandboxed( $root, $rel ) {
	if ( ! $root ) {
		return new WP_Error( 'cb_no_root', 'Base directory not found.' );
	}
	$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
	if ( $rel === '' ) {
		return array( 'root' => $root, 'path' => $root );
	}
	foreach ( explode( '/', $rel ) as $seg ) {
		if ( $seg === '..' || $seg === '.' ) {
			return new WP_Error( 'cb_traversal', 'Path traversal is not allowed.' );
		}
	}
	$target = $root . '/' . $rel;
	$real   = realpath( $target );
	if ( $real !== false && strpos( $real, $root ) !== 0 ) {
		return new WP_Error( 'cb_escape', 'Path escapes the allowed directory.' );
	}
	return array( 'root' => $root, 'path' => $target );
}

/** Pick theme-relative resolution when "theme" is given, else wp-content-relative. */
function cb_resolve( $args ) {
	if ( ! empty( $args['theme'] ) ) {
		return cb_resolve_theme_path( $args['theme'], isset( $args['path'] ) ? $args['path'] : '' );
	}
	$rel = isset( $args['path'] ) ? $args['path'] : ( isset( $args['dir'] ) ? $args['dir'] : '' );
	return cb_resolve_content_path( $rel );
}

/* ============================================================================
 * 2. CORE OPERATIONS  (shared by the REST layer and the MCP layer)
 * Each returns an array on success or a WP_Error on failure.
 * ========================================================================== */

/* ---- Files (themes + plugins + anything under wp-content) ---- */

function cb_op_list_files( $args ) {
	$r = cb_resolve( $args );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	$base = $r['path'];
	if ( ! is_dir( $base ) ) {
		return new WP_Error( 'cb_no_dir', 'Directory does not exist.' );
	}
	$files = array();
	$it    = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $base, FilesystemIterator::SKIP_DOTS ) );
	foreach ( $it as $file ) {
		$p = str_replace( '\\', '/', $file->getPathname() );
		if ( strpos( $p, '/node_modules/' ) !== false || strpos( $p, '/.git/' ) !== false ) {
			continue;
		}
		if ( $file->isFile() ) {
			$files[] = array(
				'path'  => str_replace( $base . '/', '', $p ),
				'bytes' => $file->getSize(),
			);
			if ( count( $files ) >= 5000 ) {
				break;
			}
		}
	}
	sort( $files );
	return array( 'files' => $files, 'count' => count( $files ) );
}

function cb_op_read_file( $args ) {
	$r = cb_resolve( $args );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	if ( ! is_file( $r['path'] ) ) {
		return new WP_Error( 'cb_no_file', 'File does not exist.' );
	}
	return array( 'path' => isset( $args['path'] ) ? $args['path'] : '', 'content' => file_get_contents( $r['path'] ) );
}

function cb_op_write_file( $args ) {
	$r = cb_resolve( $args );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	$dir = dirname( $r['path'] );
	if ( ! is_dir( $dir ) ) {
		wp_mkdir_p( $dir );
	}
	$bytes = file_put_contents( $r['path'], (string) $args['content'] );
	if ( $bytes === false ) {
		return new WP_Error( 'cb_write_failed', 'Could not write file (check permissions).' );
	}
	return array( 'path' => isset( $args['path'] ) ? $args['path'] : '', 'bytes' => $bytes, 'written' => true );
}

function cb_op_edit_file( $args ) {
	$r = cb_resolve( $args );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	if ( ! is_file( $r['path'] ) ) {
		return new WP_Error( 'cb_no_file', 'File does not exist.' );
	}
	$content = file_get_contents( $r['path'] );
	$search  = (string) $args['search'];
	$replace = (string) $args['replace'];
	$count   = substr_count( $content, $search );
	if ( $count === 0 ) {
		return new WP_Error( 'cb_no_match', 'Search string not found in file.' );
	}
	if ( empty( $args['replace_all'] ) && $count > 1 ) {
		return new WP_Error( 'cb_multi_match', "Search string is not unique ($count matches). Set replace_all=true or refine it." );
	}
	$new = empty( $args['replace_all'] )
		? preg_replace( '/' . preg_quote( $search, '/' ) . '/', addcslashes( $replace, '\\$' ), $content, 1 )
		: str_replace( $search, $replace, $content );
	if ( file_put_contents( $r['path'], $new ) === false ) {
		return new WP_Error( 'cb_write_failed', 'Could not write file.' );
	}
	return array( 'path' => isset( $args['path'] ) ? $args['path'] : '', 'replaced' => empty( $args['replace_all'] ) ? 1 : $count );
}

function cb_op_delete_file( $args ) {
	$r = cb_resolve( $args );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	if ( ! is_file( $r['path'] ) ) {
		return new WP_Error( 'cb_no_file', 'File does not exist.' );
	}
	unlink( $r['path'] );
	return array( 'path' => isset( $args['path'] ) ? $args['path'] : '', 'deleted' => true );
}

/* ---- Themes ---- */

function cb_op_list_themes() {
	$out = array();
	foreach ( wp_get_themes() as $slug => $theme ) {
		$out[] = array(
			'stylesheet' => $slug,
			'name'       => $theme->get( 'Name' ),
			'version'    => $theme->get( 'Version' ),
			'active'     => ( get_stylesheet() === $slug ),
		);
	}
	return array( 'themes' => $out, 'active' => get_stylesheet() );
}

function cb_op_activate_theme( $args ) {
	$theme = $args['theme'];
	if ( ! wp_get_theme( $theme )->exists() ) {
		return new WP_Error( 'cb_no_theme', "Theme '$theme' not found." );
	}
	switch_theme( $theme );
	cb_op_flush_cache();
	return array( 'activated' => $theme, 'active' => get_stylesheet() );
}

function cb_op_preview_url( $args ) {
	if ( ! wp_get_theme( $args['theme'] )->exists() ) {
		return new WP_Error( 'cb_no_theme', "Theme '{$args['theme']}' not found." );
	}
	$token = wp_generate_password( 20, false );
	set_transient( CB_PREVIEW_TRANSIENT . '_' . $token, $args['theme'], 2 * HOUR_IN_SECONDS );
	return array( 'preview_url' => add_query_arg( 'cb_preview', $token, home_url( '/' ) ), 'expires_in' => '2 hours' );
}

/* ---- Plugins ---- */

function cb_load_plugin_fns() {
	if ( ! function_exists( 'get_plugins' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
}

function cb_op_list_plugins() {
	cb_load_plugin_fns();
	$active = (array) get_option( 'active_plugins', array() );
	$out    = array();
	foreach ( get_plugins() as $file => $data ) {
		$out[] = array(
			'plugin'  => $file,
			'name'    => $data['Name'],
			'version' => $data['Version'],
			'active'  => in_array( $file, $active, true ),
		);
	}
	return array( 'plugins' => $out, 'count' => count( $out ) );
}

function cb_op_create_plugin( $args ) {
	$slug = sanitize_key( isset( $args['slug'] ) ? $args['slug'] : '' );
	if ( $slug === '' ) {
		return new WP_Error( 'cb_no_slug', 'slug is required (letters, numbers, hyphens).' );
	}
	$name = isset( $args['name'] ) ? sanitize_text_field( $args['name'] ) : $slug;
	$desc = isset( $args['description'] ) ? sanitize_text_field( $args['description'] ) : '';
	$rel  = 'plugins/' . $slug . '/' . $slug . '.php';
	$r    = cb_resolve_content_path( $rel );
	if ( is_wp_error( $r ) ) {
		return $r;
	}
	if ( is_file( $r['path'] ) ) {
		return new WP_Error( 'cb_exists', 'A plugin with that slug already exists. Use write_file/edit_file instead.' );
	}
	$header = "<?php\n/**\n * Plugin Name: {$name}\n * Description: {$desc}\n * Version: 1.0.0\n */\n\nif ( ! defined( 'ABSPATH' ) ) { exit; }\n\n";
	$body   = isset( $args['code'] ) ? (string) $args['code'] : "// Your code here.\n";
	wp_mkdir_p( dirname( $r['path'] ) );
	if ( file_put_contents( $r['path'], $header . $body ) === false ) {
		return new WP_Error( 'cb_write_failed', 'Could not create plugin file.' );
	}
	$result = array( 'plugin' => $slug . '/' . $slug . '.php', 'path' => $rel, 'created' => true );
	if ( ! empty( $args['activate'] ) ) {
		cb_load_plugin_fns();
		$act = activate_plugin( $result['plugin'] );
		$result['activated'] = is_wp_error( $act ) ? $act->get_error_message() : true;
	}
	return $result;
}

function cb_op_set_plugin_state( $args ) {
	cb_load_plugin_fns();
	$plugin = isset( $args['plugin'] ) ? $args['plugin'] : '';
	if ( $plugin === '' ) {
		return new WP_Error( 'cb_no_plugin', 'plugin is required, e.g. "my-plugin/my-plugin.php".' );
	}
	if ( ! empty( $args['active'] ) ) {
		$res = activate_plugin( $plugin );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return array( 'plugin' => $plugin, 'active' => true );
	}
	deactivate_plugins( array( $plugin ) );
	return array( 'plugin' => $plugin, 'active' => false );
}

/* ---- Cache ---- */

function cb_op_flush_cache() {
	$done = array( 'object-cache' );
	wp_cache_flush();
	if ( function_exists( 'w3tc_flush_all' ) ) {
		w3tc_flush_all();
		$done[] = 'w3-total-cache';
	}
	if ( function_exists( 'rocket_clean_domain' ) ) {
		rocket_clean_domain();
		$done[] = 'wp-rocket';
	}
	if ( function_exists( 'opcache_reset' ) ) {
		@opcache_reset();
		$done[] = 'opcache';
	}
	return array( 'flushed' => $done );
}

/* ---- Generic WordPress + WooCommerce (the "do anything" engine) ---- */

function cb_become_admin() {
	if ( is_user_logged_in() && current_user_can( 'manage_options' ) ) {
		return;
	}
	$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
	if ( ! empty( $admins ) ) {
		wp_set_current_user( (int) $admins[0] );
	}
}

function cb_op_wp_rest( $args ) {
	$method = strtoupper( isset( $args['method'] ) ? $args['method'] : 'GET' );
	$route  = isset( $args['route'] ) ? '/' . ltrim( (string) $args['route'], '/' ) : '';
	if ( $route === '' ) {
		return new WP_Error( 'cb_no_route', 'route is required, e.g. "/wc/v3/products".' );
	}
	if ( ! in_array( $method, array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
		return new WP_Error( 'cb_bad_method', 'method must be GET/POST/PUT/PATCH/DELETE.' );
	}
	cb_become_admin();
	$params = ( isset( $args['params'] ) && is_array( $args['params'] ) ) ? $args['params'] : array();
	$req    = new WP_REST_Request( $method, $route );
	if ( $method === 'GET' ) {
		$req->set_query_params( $params );
	} else {
		$req->set_header( 'Content-Type', 'application/json' );
		$req->set_body_params( $params );
	}
	$res    = rest_do_request( $req );
	$server = rest_get_server();
	return array( 'status' => $res->get_status(), 'data' => $server->response_to_data( $res, false ) );
}

function cb_op_get_option( $args ) {
	if ( empty( $args['name'] ) ) {
		return new WP_Error( 'cb_no_name', 'name is required.' );
	}
	return array( 'name' => $args['name'], 'value' => get_option( $args['name'] ) );
}

function cb_op_update_option( $args ) {
	if ( empty( $args['name'] ) ) {
		return new WP_Error( 'cb_no_name', 'name is required.' );
	}
	return array( 'name' => $args['name'], 'updated' => (bool) update_option( $args['name'], $args['value'] ) );
}

/* ============================================================================
 * 3. DRAFT PREVIEW  — swap to the target theme for a single tokened request.
 * ========================================================================== */

function cb_preview_target() {
	if ( empty( $_GET['cb_preview'] ) ) {
		return false;
	}
	$token = sanitize_text_field( wp_unslash( $_GET['cb_preview'] ) );
	return get_transient( CB_PREVIEW_TRANSIENT . '_' . $token );
}
add_filter( 'stylesheet', function ( $s ) {
	$t = cb_preview_target();
	return $t ? $t : $s;
} );
add_filter( 'template', function ( $tpl ) {
	$t = cb_preview_target();
	if ( ! $t ) {
		return $tpl;
	}
	$parent = wp_get_theme( $t )->get( 'Template' );
	return $parent ? $parent : $t;
} );

/* ============================================================================
 * 4. TOOL REGISTRY  (one definition reused by REST + MCP)
 * ========================================================================== */

function cb_tools() {
	$theme = array( 'type' => 'string', 'description' => 'Theme slug. Optional — if set, "path" is relative to that theme.' );
	$path  = array( 'type' => 'string', 'description' => 'Path relative to wp-content, e.g. "themes/my-theme/style.css" or "plugins/my-plugin/my-plugin.php". (Or relative to the theme when "theme" is given.)' );
	$dir   = array( 'type' => 'string', 'description' => 'Directory relative to wp-content, e.g. "themes/my-theme" or "plugins/my-plugin".' );
	$tools = array(
		array(
			'name' => 'list_themes', 'description' => 'List all installed themes and which is active.',
			'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'op' => 'cb_op_list_themes', 'noargs' => true,
		),
		array(
			'name' => 'list_plugins', 'description' => 'List all installed plugins and which are active.',
			'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'op' => 'cb_op_list_plugins', 'noargs' => true,
		),
		array(
			'name' => 'list_files', 'description' => 'List files in a theme or plugin directory.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme, 'dir' => $dir, 'path' => $dir ) ), 'op' => 'cb_op_list_files',
		),
		array(
			'name' => 'read_file', 'description' => 'Read a theme or plugin file.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme, 'path' => $path ), 'required' => array( 'path' ) ), 'op' => 'cb_op_read_file',
		),
		array(
			'name' => 'write_file', 'description' => 'Create or overwrite any file under wp-content (theme or plugin). Parent folders are created automatically.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme, 'path' => $path, 'content' => array( 'type' => 'string' ) ), 'required' => array( 'path', 'content' ) ), 'op' => 'cb_op_write_file',
		),
		array(
			'name' => 'edit_file', 'description' => 'Replace a unique search string in a file. Set replace_all=true to replace every occurrence.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme, 'path' => $path, 'search' => array( 'type' => 'string' ), 'replace' => array( 'type' => 'string' ), 'replace_all' => array( 'type' => 'boolean' ) ), 'required' => array( 'path', 'search', 'replace' ) ), 'op' => 'cb_op_edit_file',
		),
		array(
			'name' => 'delete_file', 'description' => 'Delete a theme or plugin file.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme, 'path' => $path ), 'required' => array( 'path' ) ), 'op' => 'cb_op_delete_file',
		),
		array(
			'name' => 'create_plugin', 'description' => 'Scaffold a new plugin at plugins/<slug>/<slug>.php with a proper header, then optionally activate it.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array(
				'slug' => array( 'type' => 'string' ), 'name' => array( 'type' => 'string' ),
				'description' => array( 'type' => 'string' ), 'code' => array( 'type' => 'string', 'description' => 'PHP body after the header.' ),
				'activate' => array( 'type' => 'boolean' ),
			), 'required' => array( 'slug' ) ), 'op' => 'cb_op_create_plugin',
		),
		array(
			'name' => 'set_plugin_state', 'description' => 'Activate or deactivate a plugin.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'plugin' => array( 'type' => 'string', 'description' => 'Plugin file, e.g. "my-plugin/my-plugin.php".' ), 'active' => array( 'type' => 'boolean' ) ), 'required' => array( 'plugin', 'active' ) ), 'op' => 'cb_op_set_plugin_state',
		),
		array(
			'name' => 'activate_theme', 'description' => 'Activate (publish) a theme and flush caches.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme ), 'required' => array( 'theme' ) ), 'op' => 'cb_op_activate_theme',
		),
		array(
			'name' => 'preview_url', 'description' => 'Get a tokened preview URL that renders an inactive theme for 2 hours.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => $theme ), 'required' => array( 'theme' ) ), 'op' => 'cb_op_preview_url',
		),
		array(
			'name' => 'flush_cache', 'description' => 'Flush object cache, W3 Total Cache, WP Rocket, and OPcache.',
			'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'op' => 'cb_op_flush_cache', 'noargs' => true,
		),
		array(
			'name' => 'wp_rest', 'description' => 'Call ANY WordPress or WooCommerce REST route with full admin rights — the do-anything tool. WP: "/wp/v2/posts", "/wp/v2/pages", "/wp/v2/media", "/wp/v2/users", "/wp/v2/plugins". WooCommerce: "/wc/v3/products", "/wc/v3/orders", "/wc/v3/coupons", "/wc/v3/customers", "/wc/v3/reports/sales", "/wc/v3/settings".',
			'inputSchema' => array( 'type' => 'object', 'properties' => array(
				'method' => array( 'type' => 'string', 'enum' => array( 'GET', 'POST', 'PUT', 'PATCH', 'DELETE' ) ),
				'route'  => array( 'type' => 'string' ),
				'params' => array( 'type' => 'object', 'description' => 'Query params for GET, or body fields for writes.' ),
			), 'required' => array( 'route' ) ), 'op' => 'cb_op_wp_rest',
		),
		array(
			'name' => 'get_option', 'description' => 'Read any WordPress/plugin/WooCommerce option.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'name' => array( 'type' => 'string' ) ), 'required' => array( 'name' ) ), 'op' => 'cb_op_get_option',
		),
		array(
			'name' => 'update_option', 'description' => 'Create or update any option. value may be a string, number, boolean, object, or array.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'name' => array( 'type' => 'string' ), 'value' => array( 'description' => 'Any JSON value.' ) ), 'required' => array( 'name', 'value' ) ), 'op' => 'cb_op_update_option',
		),
		array(
			'name' => 'render_page', 'description' => 'Render a same-site page server-side and return its HTML (headless view-source), to inspect layout/markup. Optionally extract one selector: a bare tag ("header"), one .class, or one #id. Use max_length/offset to page through large output.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array(
				'url'        => array( 'type' => 'string', 'description' => 'Full same-site URL to render (e.g. https://site.com/product/x/). Defaults to the home page.' ),
				'selector'   => array( 'type' => 'string', 'description' => 'Optional: a bare tag, one .class, or one #id to extract.' ),
				'max_length' => array( 'type' => 'integer', 'description' => 'Max characters to return (default 60000).' ),
				'offset'     => array( 'type' => 'integer', 'description' => 'Character offset to start from (for paging).' ),
			) ), 'op' => 'cb_op_render_page',
		),
		array(
			'name' => 'screenshot', 'description' => 'Take a real screenshot of a public URL via WordPress.com mShots (free, no key needed). Returns a screenshot_url you can open plus the PNG byte size; add inline=true to also get a base64 PNG (large). Desktop viewport only. mShots renders async - if ready=false, call again in a few seconds.',
			'inputSchema' => array( 'type' => 'object', 'properties' => array(
				'url'    => array( 'type' => 'string', 'description' => 'Full public URL to screenshot. Defaults to the home page.' ),
				'width'  => array( 'type' => 'integer', 'description' => 'Output width in px (default 1200).' ),
				'height' => array( 'type' => 'integer', 'description' => 'Optional max height in px.' ),
				'inline' => array( 'type' => 'boolean', 'description' => 'If true, include a base64 PNG in the response (large).' ),
			) ), 'op' => 'cb_op_screenshot',
		),
	);

	// ---- Auto-generated CRUD tools (WordPress + WooCommerce content) ----
	$nocreate = array( 'media' ); // media is created via upload_media_from_url
	foreach ( cb_rest_resources() as $r => $route ) {
		$tools[] = array( 'name' => "list_$r", 'description' => "List $r (filters: per_page, page, search, etc.).",
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'per_page' => array( 'type' => 'integer' ), 'page' => array( 'type' => 'integer' ), 'search' => array( 'type' => 'string' ) ) ),
			'rest' => array( 'kind' => 'list', 'route' => $route ) );
		$tools[] = array( 'name' => "get_$r", 'description' => "Get a single $r by id.",
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'id' => array( 'type' => 'integer' ) ), 'required' => array( 'id' ) ),
			'rest' => array( 'kind' => 'item', 'route' => $route ) );
		if ( ! in_array( $r, $nocreate, true ) ) {
			$tools[] = array( 'name' => "create_$r", 'description' => "Create a $r. Pass resource fields directly as arguments (e.g. title, content, status, name, price, meta…).",
				'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ),
				'rest' => array( 'kind' => 'create', 'route' => $route ) );
		}
		$tools[] = array( 'name' => "update_$r", 'description' => "Update a $r. Requires id plus the fields to change.",
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'id' => array( 'type' => 'integer' ) ), 'required' => array( 'id' ) ),
			'rest' => array( 'kind' => 'update', 'route' => $route ) );
		$tools[] = array( 'name' => "delete_$r", 'description' => "Delete a $r by id (add force=true to delete permanently).",
			'inputSchema' => array( 'type' => 'object', 'properties' => array( 'id' => array( 'type' => 'integer' ), 'force' => array( 'type' => 'boolean' ) ), 'required' => array( 'id' ) ),
			'rest' => array( 'kind' => 'delete', 'route' => $route ) );
	}

	// ---- Extra named tools ----
	$tools[] = array( 'name' => 'get_settings', 'description' => 'Get WordPress site settings.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'rest' => array( 'kind' => 'list', 'route' => '/wp/v2/settings' ) );
	$tools[] = array( 'name' => 'update_settings', 'description' => 'Update site settings (title, description, posts_per_page…).', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'rest' => array( 'kind' => 'create', 'route' => '/wp/v2/settings' ) );
	$tools[] = array( 'name' => 'list_post_types', 'description' => 'List registered post types.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'rest' => array( 'kind' => 'list', 'route' => '/wp/v2/types' ) );
	$tools[] = array( 'name' => 'list_taxonomies', 'description' => 'List taxonomies.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'rest' => array( 'kind' => 'list', 'route' => '/wp/v2/taxonomies' ) );
	$tools[] = array( 'name' => 'list_statuses', 'description' => 'List post statuses.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'rest' => array( 'kind' => 'list', 'route' => '/wp/v2/statuses' ) );
	$tools[] = array( 'name' => 'search', 'description' => 'Site-wide search. Pass {search:"..."}.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'search' => array( 'type' => 'string' ) ), 'required' => array( 'search' ) ), 'rest' => array( 'kind' => 'list', 'route' => '/wp/v2/search' ) );
	$tools[] = array( 'name' => 'upload_media_from_url', 'description' => 'Download a file from a URL into the Media Library.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'url' => array( 'type' => 'string' ), 'title' => array( 'type' => 'string' ) ), 'required' => array( 'url' ) ), 'op' => 'cb_op_upload_media_from_url' );
	$tools[] = array( 'name' => 'count_posts', 'description' => 'Count posts by status for a post type (default "post").', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'post_type' => array( 'type' => 'string' ) ) ), 'op' => 'cb_op_count_posts' );
	$tools[] = array( 'name' => 'count_terms', 'description' => 'Count terms in a taxonomy.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'taxonomy' => array( 'type' => 'string' ) ), 'required' => array( 'taxonomy' ) ), 'op' => 'cb_op_count_terms' );

	// ---- Site / system ----
	$tools[] = array( 'name' => 'site_info', 'description' => 'WordPress version, PHP version, active theme, active plugins, WooCommerce status, language.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'op' => 'cb_op_site_info', 'noargs' => true );
	$tools[] = array( 'name' => 'db_query', 'description' => 'Run a read-only SELECT query. Use {prefix} for the table prefix, e.g. "SELECT * FROM {prefix}posts LIMIT 5".', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'sql' => array( 'type' => 'string' ) ), 'required' => array( 'sql' ) ), 'op' => 'cb_op_db_query' );

	// ---- Install / delete plugins & themes ----
	$tools[] = array( 'name' => 'install_plugin', 'description' => 'Install a plugin from a wp.org slug or a zip URL; optionally activate it.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'slug' => array( 'type' => 'string' ), 'zip_url' => array( 'type' => 'string' ), 'activate' => array( 'type' => 'boolean' ) ) ), 'op' => 'cb_op_install_plugin' );
	$tools[] = array( 'name' => 'install_theme', 'description' => 'Install a theme from a wp.org slug or a zip URL; optionally activate it.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'slug' => array( 'type' => 'string' ), 'zip_url' => array( 'type' => 'string' ), 'activate' => array( 'type' => 'boolean' ) ) ), 'op' => 'cb_op_install_theme' );
	$tools[] = array( 'name' => 'delete_plugin', 'description' => 'Deactivate and delete a plugin.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'plugin' => array( 'type' => 'string' ) ), 'required' => array( 'plugin' ) ), 'op' => 'cb_op_delete_plugin' );
	$tools[] = array( 'name' => 'delete_theme', 'description' => 'Delete an inactive theme.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'theme' => array( 'type' => 'string' ) ), 'required' => array( 'theme' ) ), 'op' => 'cb_op_delete_theme' );

	// ---- Revisions ----
	$tools[] = array( 'name' => 'list_revisions', 'description' => 'List revisions of a post/page.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'post_id' => array( 'type' => 'integer' ) ), 'required' => array( 'post_id' ) ), 'op' => 'cb_op_list_revisions' );
	$tools[] = array( 'name' => 'restore_revision', 'description' => 'Restore a post/page to a revision.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'revision_id' => array( 'type' => 'integer' ) ), 'required' => array( 'revision_id' ) ), 'op' => 'cb_op_restore_revision' );

	// ---- Metadata ----
	$meta_props = array( 'object_type' => array( 'type' => 'string', 'description' => 'post | term | user | comment (default post).' ), 'object_id' => array( 'type' => 'integer' ), 'key' => array( 'type' => 'string' ) );
	$tools[] = array( 'name' => 'get_meta', 'description' => 'Get metadata for a post/term/user/comment. Omit key to get all meta.', 'inputSchema' => array( 'type' => 'object', 'properties' => $meta_props, 'required' => array( 'object_id' ) ), 'op' => 'cb_op_get_meta' );
	$tools[] = array( 'name' => 'update_meta', 'description' => 'Set a metadata value.', 'inputSchema' => array( 'type' => 'object', 'properties' => $meta_props + array( 'value' => array( 'description' => 'Any JSON value.' ) ), 'required' => array( 'object_id', 'key', 'value' ) ), 'op' => 'cb_op_update_meta' );
	$tools[] = array( 'name' => 'delete_meta', 'description' => 'Delete a metadata key.', 'inputSchema' => array( 'type' => 'object', 'properties' => $meta_props, 'required' => array( 'object_id', 'key' ) ), 'op' => 'cb_op_delete_meta' );

	// Bundled WordPress skills (shipped inside this plugin).
	$tools[] = array( 'name' => 'list_wp_skills', 'description' => 'List the WordPress engineering skills bundled in this plugin (security review, performance, blocks, themes, WooCommerce, REST API, ACF/content modeling, headless/WPGraphQL, migrations, accessibility, testing, CI/CD, WP-CLI/ops, PHPStan, Playground, admin UI, plugin development, site audit/onboarding). Each is a focused review or build playbook. Call this first, then get_wp_skill to load the matching one before doing WordPress work.', 'inputSchema' => array( 'type' => 'object', 'properties' => new stdClass() ), 'op' => 'cb_op_list_wp_skills', 'noargs' => true );
	$tools[] = array( 'name' => 'get_wp_skill', 'description' => 'Load a bundled WordPress skill. Returns the skill\'s SKILL.md instructions, or a named reference file within it. Call list_wp_skills first to see available skill names and their files. Use the matching skill before reviewing, auditing, or building WordPress/WooCommerce code.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'name' => array( 'type' => 'string', 'description' => 'Skill name, e.g. "wp-security-review".' ), 'file' => array( 'type' => 'string', 'description' => 'Optional file within the skill, e.g. "references/escaping-guide.md". Defaults to SKILL.md.' ) ), 'required' => array( 'name' ) ), 'op' => 'cb_op_get_wp_skill' );

	// Cookbook: the same recipes the site owner sees in wp-admin.
	$tools[] = array( 'name' => 'list_recipes', 'description' => 'List the cookbook recipes bundled with this plugin — ready-made playbooks for the jobs people hand to an AI on a WordPress site (security audit, speed audit, plugin conflict hunt, child theme, alt text sweep, content calendar, WooCommerce restock/sale/checkout review, Elementor header & footer, theme.json rebrand, and more). Each returns an id; call get_recipe for the full prompt. Set for_this_site=true to see only the recipes whose stack this site actually has.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'tag' => array( 'type' => 'string', 'description' => 'Filter by tag, e.g. "WooCommerce", "Security", "Performance".' ), 'search' => array( 'type' => 'string' ), 'for_this_site' => array( 'type' => 'boolean', 'description' => 'Only recipes matching this site (WooCommerce, Elementor, block theme, …).' ) ) ), 'op' => 'cb_op_list_recipes' );
	$tools[] = array( 'name' => 'get_recipe', 'description' => 'Load one cookbook recipe in full: what it does, which bridge tools it uses, and the complete prompt with its [bracketed] placeholders. Call list_recipes first for valid ids. Use a recipe as the plan when the user asks for something it covers.', 'inputSchema' => array( 'type' => 'object', 'properties' => array( 'id' => array( 'type' => 'string', 'description' => 'Recipe id, e.g. "security-audit".' ) ), 'required' => array( 'id' ) ), 'op' => 'cb_op_get_recipe' );

	$tools[] = array(
		'name'        => 'conflict_scan',
		'description' => 'Find which active plugin breaks a page (white screen / fatal error / "critical error"). It deactivates each active plugin ONE AT A TIME, reloads the URL server-side, checks health, then IMMEDIATELY reactivates it — stopping at the first plugin whose removal fixes the page. It never deactivates this bridge plugin, and fully restores every plugin before returning. Params: url (required, same-site page to test), expect (optional string that must appear when the page is healthy), forbid (optional extra error signature to treat as broken), only (optional array of plugin files to limit the scan to), skip (optional array of plugin files to never touch, e.g. ["woocommerce/woocommerce.php"]). NOTE: it tests page-LOAD health as an anonymous request; interaction/AJAX bugs (like a fatal only when removing a cart item) will not reproduce unless the URL itself fatals on load. Run during low traffic — each plugin is briefly off while its test request runs.',
		'inputSchema' => array(
			'type'       => 'object',
			'properties' => array(
				'url'    => array( 'type' => 'string', 'description' => 'Same-site page URL to test.' ),
				'expect' => array( 'type' => 'string', 'description' => 'Substring that must be present when the page is healthy.' ),
				'forbid' => array( 'type' => 'string', 'description' => 'Extra substring that marks the page as broken if present.' ),
				'only'   => array( 'type' => 'array', 'items' => array( 'type' => 'string' ), 'description' => 'Only test these plugin files.' ),
				'skip'   => array( 'type' => 'array', 'items' => array( 'type' => 'string' ), 'description' => 'Never deactivate these plugin files.' ),
			),
			'required'   => array( 'url' ),
		),
		'op'          => 'cb_op_conflict_scan',
	);

	return $tools;
}

function cb_op_render_page( $args ) {
	$url = isset( $args['url'] ) ? esc_url_raw( (string) $args['url'] ) : '';
	if ( '' === $url ) { $url = home_url( '/' ); }
	$home = home_url();
	$site = site_url();
	if ( 0 !== strpos( $url, $home ) && 0 !== strpos( $url, $site ) ) {
		return new WP_Error( 'cb_render_scope', 'Only same-site URLs are allowed.' );
	}
	$selector = isset( $args['selector'] ) ? trim( (string) $args['selector'] ) : '';
	$max      = isset( $args['max_length'] ) ? (int) $args['max_length'] : 0;
	if ( $max <= 0 ) { $max = 60000; }
	$offset = isset( $args['offset'] ) ? max( 0, (int) $args['offset'] ) : 0;
	$fetch = add_query_arg( 'cb_r', time(), $url );
	$resp  = wp_remote_get( $fetch, array(
		'timeout'     => 30,
		'sslverify'   => false,
		'redirection' => 3,
		'headers'     => array( 'User-Agent' => 'ClaudeBridgeRender/1.0', 'Cache-Control' => 'no-cache' ),
	) );
	if ( is_wp_error( $resp ) ) {
		return new WP_Error( 'cb_render_fetch', $resp->get_error_message() );
	}
	$code = (int) wp_remote_retrieve_response_code( $resp );
	$html = (string) wp_remote_retrieve_body( $resp );
	if ( '' !== $selector ) {
		$html = cb_render_extract( $html, $selector );
	}
	$total = strlen( $html );
	$html  = substr( $html, $offset, $max );
	return array( 'status' => $code, 'total_length' => $total, 'html' => $html );
}

function cb_render_extract( $html, $sel ) {
	if ( ! class_exists( 'DOMDocument' ) ) { return $html; }
	libxml_use_internal_errors( true );
	$doc = new DOMDocument();
	$doc->loadHTML( '<?xml encoding="utf-8" ?>' . $html );
	libxml_clear_errors();
	$xp = new DOMXPath( $doc );
	if ( 0 === strpos( $sel, '.' ) ) {
		$c = substr( $sel, 1 );
		$q = "//*[contains(concat(' ', normalize-space(@class), ' '), ' " . $c . " ')]";
	} elseif ( 0 === strpos( $sel, '#' ) ) {
		$q = "//*[@id='" . substr( $sel, 1 ) . "']";
	} else {
		$q = '//' . preg_replace( '/[^a-zA-Z0-9]/', '', $sel );
	}
	$nodes = $xp->query( $q );
	if ( ! $nodes || 0 === $nodes->length ) {
		return "[selector '" . $sel . "' matched nothing - full page follows]\n" . $html;
	}
	$out = '';
	foreach ( $nodes as $n ) {
		$out .= $doc->saveHTML( $n ) . "\n";
	}
	return $out;
}

function cb_op_screenshot( $args ) {
	$url = isset( $args['url'] ) ? esc_url_raw( (string) $args['url'] ) : '';
	if ( '' === $url ) { $url = home_url( '/' ); }
	$w = isset( $args['width'] ) ? (int) $args['width'] : 0;
	if ( $w <= 0 ) { $w = 1200; }
	$h    = isset( $args['height'] ) ? (int) $args['height'] : 0;
	$shot = 'https://s.wordpress.com/mshots/v1/' . rawurlencode( $url ) . '?w=' . $w . ( $h > 0 ? '&h=' . $h : '' );
	$png  = '';
	for ( $i = 0; $i < 4; $i++ ) {
		$r = wp_remote_get( $shot, array( 'timeout' => 18, 'sslverify' => false ) );
		if ( ! is_wp_error( $r ) ) {
			$body = (string) wp_remote_retrieve_body( $r );
			$ct   = (string) wp_remote_retrieve_header( $r, 'content-type' );
			if ( false !== strpos( $ct, 'image' ) && strlen( $body ) > 25000 ) {
				$png = $body;
				break;
			}
		}
		sleep( 3 );
	}
	if ( '' === $png ) {
		return array( 'ready' => false, 'screenshot_url' => $shot, 'note' => 'Still generating; call again in a few seconds or open the URL.' );
	}
	$out = array( 'ready' => true, 'mime' => 'image/png', 'bytes' => strlen( $png ), 'width' => $w, 'screenshot_url' => $shot );
	$inline = isset( $args['inline'] ) ? $args['inline'] : false;
	if ( true === $inline || 'true' === $inline || '1' === (string) $inline ) {
		$out['base64'] = base64_encode( $png );
	}
	return $out;
}

/** Fetch a same-site URL server-side and judge whether it loaded healthy. */
function cb_conflict_health( $url, $expect, $forbid ) {
	$fetch = add_query_arg( 'cb_cs', time() . '-' . wp_rand( 100, 999 ), $url );
	$resp  = wp_remote_get( $fetch, array(
		'timeout'     => 25,
		'sslverify'   => false,
		'redirection' => 3,
		'headers'     => array( 'User-Agent' => 'ClaudeBridgeConflictScan/1.0', 'Cache-Control' => 'no-cache' ),
	) );
	if ( is_wp_error( $resp ) ) {
		return array( 'healthy' => false, 'code' => 0, 'reason' => 'fetch_error: ' . $resp->get_error_message(), 'len' => 0 );
	}
	$code = (int) wp_remote_retrieve_response_code( $resp );
	$body = (string) wp_remote_retrieve_body( $resp );
	$len  = strlen( $body );
	$sigs = array( 'There has been a critical error', 'critical error on this website', 'Fatal error', 'Parse error', 'Uncaught Error', 'Uncaught Exception', 'Notice: Undefined' );
	if ( '' !== $forbid ) { $sigs[] = $forbid; }
	$hit = '';
	foreach ( $sigs as $s ) {
		if ( '' !== $s && false !== stripos( $body, $s ) ) { $hit = $s; break; }
	}
	$healthy = true;
	$reason  = 'ok';
	if ( $code >= 500 ) {
		$healthy = false;
		$reason  = 'http_' . $code;
	} elseif ( '' !== $hit ) {
		$healthy = false;
		$reason  = 'error_signature: ' . $hit;
	} elseif ( $len < 200 ) {
		$healthy = false;
		$reason  = 'blank_page (' . $len . ' bytes)';
	} elseif ( '' !== $expect && false === stripos( $body, $expect ) ) {
		$healthy = false;
		$reason  = 'missing_expected_content';
	}
	return array( 'healthy' => $healthy, 'code' => $code, 'reason' => $reason, 'len' => $len );
}

/** Bisect active plugins to find which one breaks a page. Always restores state. */
function cb_op_conflict_scan( $args ) {
	cb_become_admin();
	cb_load_plugin_fns();
	@set_time_limit( 0 );
	$url = isset( $args['url'] ) ? esc_url_raw( (string) $args['url'] ) : '';
	if ( '' === $url ) {
		return new WP_Error( 'cb_no_url', 'url is required (a same-site page to test).' );
	}
	$home = home_url();
	$site = site_url();
	if ( 0 !== strpos( $url, $home ) && 0 !== strpos( $url, $site ) ) {
		return new WP_Error( 'cb_scope', 'Only same-site URLs are allowed.' );
	}
	$expect = isset( $args['expect'] ) ? (string) $args['expect'] : '';
	$forbid = isset( $args['forbid'] ) ? (string) $args['forbid'] : '';
	$only   = ( isset( $args['only'] ) && is_array( $args['only'] ) ) ? array_map( 'strval', $args['only'] ) : array();
	$skip   = ( isset( $args['skip'] ) && is_array( $args['skip'] ) ) ? array_map( 'strval', $args['skip'] ) : array();

	$self     = plugin_basename( __FILE__ ); // never deactivate the bridge itself
	$original = (array) get_option( 'active_plugins', array() );

	$base = cb_conflict_health( $url, $expect, $forbid );
	if ( ! empty( $base['healthy'] ) ) {
		return array(
			'url'      => $url,
			'baseline' => $base,
			'scanned'  => 0,
			'culprit'  => null,
			'note'     => 'The page loads healthy on a plain anonymous server-side request, so a load-time scan cannot reproduce the fault. This usually means the bug only happens during an interaction (AJAX/POST such as removing a cart item), or only inside a logged-in / cart session. Point url at a page that actually fatals on load, or pass an expect/forbid string that captures the broken state.',
		);
	}

	$candidates = $only ? $only : $original;
	$results    = array();
	$culprit    = null;

	foreach ( $candidates as $plugin ) {
		if ( $plugin === $self ) {
			continue;
		}
		if ( in_array( $plugin, $skip, true ) ) {
			$results[] = array( 'plugin' => $plugin, 'skipped' => true );
			continue;
		}
		if ( ! in_array( $plugin, $original, true ) ) {
			continue; // only toggle plugins that were active to begin with
		}
		deactivate_plugins( array( $plugin ), true ); // silent: don't fire deactivation hooks
		$h = cb_conflict_health( $url, $expect, $forbid );
		activate_plugin( $plugin, '', false, true );  // silent restore
		$fixed     = ( empty( $base['healthy'] ) && ! empty( $h['healthy'] ) );
		$results[] = array(
			'plugin'          => $plugin,
			'healthy_without' => ! empty( $h['healthy'] ),
			'code'            => $h['code'],
			'reason'          => $h['reason'],
			'fixed_it'        => $fixed,
		);
		if ( $fixed && null === $culprit ) {
			$culprit = $plugin;
			break; // stop at the first culprit
		}
	}

	// Belt-and-suspenders: guarantee the original active set is fully restored.
	$now = (array) get_option( 'active_plugins', array() );
	foreach ( $original as $p ) {
		if ( $p !== $self && ! in_array( $p, $now, true ) ) {
			activate_plugin( $p, '', false, true );
		}
	}

	return array(
		'url'      => $url,
		'baseline' => $base,
		'scanned'  => count( $results ),
		'culprit'  => $culprit,
		'results'  => $results,
		'restored' => true,
		'note'     => $culprit
			? ( 'Deactivating "' . $culprit . '" fixed the page — it is the likely conflict. It has been reactivated. Update, replace, or keep it off to resolve the issue.' )
			: 'No single plugin fixed the page. The cause may be the active theme, a must-use plugin, a combination of plugins, or server config — try skip-listing WooCommerce/currency plugins, or test a different URL.',
	);
}

/** Run a tool and record the call, so the dashboard can show what happened. */
function cb_run_tool( $name, $args ) {
	$started = microtime( true );
	$res     = cb_run_tool_dispatch( $name, $args );
	cb_activity_record( $name, ! is_wp_error( $res ), (int) round( ( microtime( true ) - $started ) * 1000 ) );
	return $res;
}

function cb_run_tool_dispatch( $name, $args ) {
	foreach ( cb_tools() as $t ) {
		if ( $t['name'] === $name ) {
			if ( isset( $t['rest'] ) ) {
				return cb_run_rest_tool( $t['rest'], (array) $args );
			}
			return ! empty( $t['noargs'] ) ? call_user_func( $t['op'] ) : call_user_func( $t['op'], (array) $args );
		}
	}
	return new WP_Error( 'cb_unknown_tool', "Unknown tool: $name" );
}

/** Dispatch an auto-generated CRUD tool to the right REST route/method. */
function cb_run_rest_tool( $meta, $args ) {
	$route = $meta['route'];
	$kind  = $meta['kind'];
	if ( $kind === 'list' ) {
		return cb_op_wp_rest( array( 'method' => 'GET', 'route' => $route, 'params' => $args ) );
	}
	if ( $kind === 'create' ) {
		return cb_op_wp_rest( array( 'method' => 'POST', 'route' => $route, 'params' => $args ) );
	}
	$id = isset( $args['id'] ) ? $args['id'] : 0;
	if ( ! $id ) {
		return new WP_Error( 'cb_no_id', 'id is required.' );
	}
	unset( $args['id'] );
	if ( $kind === 'item' ) {
		return cb_op_wp_rest( array( 'method' => 'GET', 'route' => $route . '/' . $id ) );
	}
	if ( $kind === 'update' ) {
		return cb_op_wp_rest( array( 'method' => 'PUT', 'route' => $route . '/' . $id, 'params' => $args ) );
	}
	if ( $kind === 'delete' ) {
		return cb_op_wp_rest( array( 'method' => 'DELETE', 'route' => $route . '/' . $id, 'params' => $args ) );
	}
	return new WP_Error( 'cb_bad_kind', 'Unknown REST tool kind.' );
}

/** Resources exposed as auto-generated list/get/create/update/delete tools. */
function cb_rest_resources() {
	return array(
		'posts'              => '/wp/v2/posts',
		'pages'              => '/wp/v2/pages',
		'media'              => '/wp/v2/media',
		'categories'         => '/wp/v2/categories',
		'tags'               => '/wp/v2/tags',
		'comments'           => '/wp/v2/comments',
		'users'              => '/wp/v2/users',
		'menus'              => '/wp/v2/menus',
		'menu_items'         => '/wp/v2/menu-items',
		'blocks'             => '/wp/v2/blocks',
		'templates'          => '/wp/v2/templates',
		'products'           => '/wc/v3/products',
		'orders'             => '/wc/v3/orders',
		'coupons'            => '/wc/v3/coupons',
		'customers'          => '/wc/v3/customers',
		'product_categories' => '/wc/v3/products/categories',
	);
}

function cb_op_upload_media_from_url( $args ) {
	$url = isset( $args['url'] ) ? esc_url_raw( $args['url'] ) : '';
	if ( ! $url ) {
		return new WP_Error( 'cb_no_url', 'url is required.' );
	}
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';
	cb_become_admin();
	$tmp = download_url( $url );
	if ( is_wp_error( $tmp ) ) {
		return $tmp;
	}
	$file = array( 'name' => basename( parse_url( $url, PHP_URL_PATH ) ), 'tmp_name' => $tmp );
	$id   = media_handle_sideload( $file, 0, isset( $args['title'] ) ? $args['title'] : '' );
	if ( is_wp_error( $id ) ) {
		@unlink( $tmp );
		return $id;
	}
	return array( 'id' => $id, 'url' => wp_get_attachment_url( $id ) );
}

function cb_op_count_posts( $args ) {
	$type = isset( $args['post_type'] ) ? $args['post_type'] : 'post';
	return array( 'post_type' => $type, 'counts' => (array) wp_count_posts( $type ) );
}

function cb_op_count_terms( $args ) {
	if ( empty( $args['taxonomy'] ) ) {
		return new WP_Error( 'cb_no_tax', 'taxonomy is required.' );
	}
	$n = wp_count_terms( array( 'taxonomy' => $args['taxonomy'], 'hide_empty' => false ) );
	return array( 'taxonomy' => $args['taxonomy'], 'count' => is_wp_error( $n ) ? 0 : (int) $n );
}

/* ---- Site info ---- */

function cb_op_site_info() {
	global $wp_version;
	return array(
		'wp_version'     => $wp_version,
		'php_version'    => phpversion(),
		'site_url'       => site_url(),
		'home_url'       => home_url(),
		'active_theme'   => get_stylesheet(),
		'active_plugins' => array_values( (array) get_option( 'active_plugins', array() ) ),
		'woocommerce'    => class_exists( 'WooCommerce' ),
		'language'       => get_locale(),
	);
}

/* ---- Read-only SQL ---- */

function cb_op_db_query( $args ) {
	global $wpdb;
	$sql = isset( $args['sql'] ) ? trim( (string) $args['sql'] ) : '';
	if ( $sql === '' ) {
		return new WP_Error( 'cb_no_sql', 'sql is required.' );
	}
	if ( ! preg_match( '/^select\s/i', $sql ) ) {
		return new WP_Error( 'cb_readonly', 'Only SELECT queries are allowed.' );
	}
	if ( preg_match( '/;\s*\S/', $sql ) ) {
		return new WP_Error( 'cb_multi', 'Only a single statement is allowed.' );
	}
	$sql  = str_replace( '{prefix}', $wpdb->prefix, $sql );
	$rows = $wpdb->get_results( $sql, ARRAY_A );
	return array( 'rows' => $rows, 'count' => is_array( $rows ) ? count( $rows ) : 0 );
}

/* ---- Install / delete plugins & themes ---- */

function cb_upgrader_skin() {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	return new WP_Ajax_Upgrader_Skin();
}

function cb_op_install_plugin( $args ) {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
	$skin   = cb_upgrader_skin();
	$slug   = isset( $args['slug'] ) ? sanitize_key( $args['slug'] ) : '';
	$zip    = isset( $args['zip_url'] ) ? esc_url_raw( $args['zip_url'] ) : '';
	$source = $zip;
	if ( ! $source && $slug ) {
		$api = plugins_api( 'plugin_information', array( 'slug' => $slug, 'fields' => array( 'sections' => false ) ) );
		if ( is_wp_error( $api ) ) {
			return $api;
		}
		$source = $api->download_link;
	}
	if ( ! $source ) {
		return new WP_Error( 'cb_need', 'Provide slug (wp.org) or zip_url.' );
	}
	$upgrader = new Plugin_Upgrader( $skin );
	$res      = $upgrader->install( $source );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$out = array( 'installed' => (bool) $res, 'plugin' => $upgrader->plugin_info() );
	if ( ! empty( $args['activate'] ) && $out['plugin'] ) {
		$act = activate_plugin( $out['plugin'] );
		$out['activated'] = is_wp_error( $act ) ? $act->get_error_message() : true;
	}
	return $out;
}

function cb_op_install_theme( $args ) {
	require_once ABSPATH . 'wp-admin/includes/theme.php';
	$skin   = cb_upgrader_skin();
	$slug   = isset( $args['slug'] ) ? sanitize_key( $args['slug'] ) : '';
	$zip    = isset( $args['zip_url'] ) ? esc_url_raw( $args['zip_url'] ) : '';
	$source = $zip;
	if ( ! $source && $slug ) {
		$api = themes_api( 'theme_information', array( 'slug' => $slug, 'fields' => array( 'sections' => false ) ) );
		if ( is_wp_error( $api ) ) {
			return $api;
		}
		$source = $api->download_link;
	}
	if ( ! $source ) {
		return new WP_Error( 'cb_need', 'Provide slug (wp.org) or zip_url.' );
	}
	$upgrader = new Theme_Upgrader( $skin );
	$res      = $upgrader->install( $source );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	$out = array( 'installed' => (bool) $res, 'theme' => $upgrader->theme_info() ? $upgrader->theme_info()->get_stylesheet() : null );
	if ( ! empty( $args['activate'] ) && $out['theme'] ) {
		switch_theme( $out['theme'] );
		$out['activated'] = true;
	}
	return $out;
}

function cb_op_delete_plugin( $args ) {
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';
	$plugin = isset( $args['plugin'] ) ? $args['plugin'] : '';
	if ( ! $plugin ) {
		return new WP_Error( 'cb_no_plugin', 'plugin is required, e.g. "my-plugin/my-plugin.php".' );
	}
	deactivate_plugins( array( $plugin ) );
	$res = delete_plugins( array( $plugin ) );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	return array( 'plugin' => $plugin, 'deleted' => true );
}

function cb_op_delete_theme( $args ) {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/theme.php';
	$theme = isset( $args['theme'] ) ? $args['theme'] : '';
	if ( ! $theme ) {
		return new WP_Error( 'cb_no_theme', 'theme is required.' );
	}
	if ( get_stylesheet() === $theme ) {
		return new WP_Error( 'cb_active', 'Cannot delete the active theme.' );
	}
	$res = delete_theme( $theme );
	if ( is_wp_error( $res ) ) {
		return $res;
	}
	return array( 'theme' => $theme, 'deleted' => true );
}

/* ---- Revisions ---- */

function cb_op_list_revisions( $args ) {
	$pid = isset( $args['post_id'] ) ? (int) $args['post_id'] : 0;
	if ( ! $pid ) {
		return new WP_Error( 'cb_no_post', 'post_id is required.' );
	}
	$out = array();
	foreach ( wp_get_post_revisions( $pid, array( 'posts_per_page' => 25 ) ) as $r ) {
		$out[] = array( 'id' => $r->ID, 'modified' => $r->post_modified, 'author' => $r->post_author );
	}
	return array( 'post_id' => $pid, 'revisions' => $out );
}

function cb_op_restore_revision( $args ) {
	$rid = isset( $args['revision_id'] ) ? (int) $args['revision_id'] : 0;
	if ( ! $rid ) {
		return new WP_Error( 'cb_no_rev', 'revision_id is required.' );
	}
	$res = wp_restore_post_revision( $rid );
	return array( 'restored' => (bool) $res, 'post_id' => $res );
}

/* ---- Metadata (post / term / user / comment) ---- */

function cb_op_get_meta( $args ) {
	$type = isset( $args['object_type'] ) ? $args['object_type'] : 'post';
	$id   = isset( $args['object_id'] ) ? (int) $args['object_id'] : 0;
	$key  = isset( $args['key'] ) ? $args['key'] : '';
	if ( ! $id ) {
		return new WP_Error( 'cb_no_id', 'object_id is required.' );
	}
	return array( 'object_type' => $type, 'object_id' => $id, 'key' => $key, 'value' => get_metadata( $type, $id, $key, $key !== '' ) );
}

function cb_op_update_meta( $args ) {
	$type = isset( $args['object_type'] ) ? $args['object_type'] : 'post';
	$id   = isset( $args['object_id'] ) ? (int) $args['object_id'] : 0;
	$key  = isset( $args['key'] ) ? $args['key'] : '';
	if ( ! $id || $key === '' ) {
		return new WP_Error( 'cb_meta', 'object_id and key are required.' );
	}
	return array( 'updated' => (bool) update_metadata( $type, $id, $key, $args['value'] ) );
}

function cb_op_delete_meta( $args ) {
	$type = isset( $args['object_type'] ) ? $args['object_type'] : 'post';
	$id   = isset( $args['object_id'] ) ? (int) $args['object_id'] : 0;
	$key  = isset( $args['key'] ) ? $args['key'] : '';
	if ( ! $id || $key === '' ) {
		return new WP_Error( 'cb_meta', 'object_id and key are required.' );
	}
	return array( 'deleted' => (bool) delete_metadata( $type, $id, $key ) );
}

/* ============================================================================
 * 5. REST LAYER  (Application Password auth, requires edit_themes)
 * ========================================================================== */

function cb_rest_permission() {
	return current_user_can( 'edit_themes' )
		? true
		: new WP_Error( 'cb_forbidden', 'Requires edit_themes capability.', array( 'status' => 403 ) );
}

add_action( 'rest_api_init', function () {
	$ns = 'claude-bridge/v1';

	register_rest_route( $ns, '/tool/(?P<name>[a-z_]+)', array(
		'methods'             => 'POST',
		'permission_callback' => 'cb_rest_permission',
		'callback'            => function ( $req ) {
			cb_activity_channel( 'rest' );
			$res = cb_run_tool( $req['name'], (array) $req->get_json_params() );
			if ( is_wp_error( $res ) ) {
				return new WP_REST_Response( array( 'error' => $res->get_error_message() ), 400 );
			}
			return rest_ensure_response( $res );
		},
	) );

	// Connector handshake check — the hub server calls this (signed) to verify pairing.
	register_rest_route( $ns, '/connector/ping', array(
		'methods'             => 'GET',
		'permission_callback' => 'cb_connector_request_signed',
		'callback'            => function () {
			return rest_ensure_response( array(
				'ok'        => true,
				'site'      => home_url(),
				'name'      => get_bloginfo( 'name' ),
				'version'   => CB_VERSION,
				'connector' => cb_connector_enabled(),
			) );
		},
	) );

	// Same MCP handler on three route names, so a blocked path can fall back to another.
	foreach ( array( '/mcp', '/sse', '/rpc' ) as $cb_r ) {
		register_rest_route( $ns, $cb_r, array(
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'cb_mcp_handler',
			),
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => 'cb_mcp_get_info',
			),
		) );
	}
} );

/* Fallback transport 1: admin-ajax — reachable when custom REST routes are blocked.
 * POST /wp-admin/admin-ajax.php?action=cb_mcp  (auth via Bearer header or ?token=). */
add_action( 'wp_ajax_cb_mcp', 'cb_mcp_run_raw' );
add_action( 'wp_ajax_nopriv_cb_mcp', 'cb_mcp_run_raw' );

/* Fallback transport 2: query-var endpoint — reachable when the REST API is fully off.
 * POST /?cb_mcp=1  (auth via Bearer header or ?token=). */
add_action( 'init', 'cb_mcp_altroute', 1 );
function cb_mcp_altroute() {
	if ( ! isset( $_GET['cb_mcp'] ) ) {
		return;
	}
	$m = isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : 'GET';
	if ( $m === 'POST' || $m === 'OPTIONS' ) {
		cb_mcp_run_raw(); // handles auth + dispatch, then exits
	}
	// GET probe: return the same info document the REST GET serves.
	status_header( 200 );
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Access-Control-Allow-Origin: *' );
	echo wp_json_encode( cb_mcp_get_info()->get_data() );
	exit;
}

/* ============================================================================
 * 5b. BUNDLED WORDPRESS SKILLS
 * Ships a library of WordPress engineering skills inside the plugin so the
 * connected model can pull them on demand. Exposed three ways for maximum
 * client compatibility: as tools (list_wp_skills / get_wp_skill), as MCP
 * resources (cbskill:// URIs), and as MCP prompts.
 * ========================================================================== */

function cb_skills_dir() {
	return untrailingslashit( plugin_dir_path( __FILE__ ) ) . '/skills';
}

/** Resolve & sandbox a relative path inside a single bundled skill directory. */
function cb_skill_path( $slug, $rel = '' ) {
	$slug = trim( (string) $slug );
	if ( $slug === '' || strpos( $slug, '..' ) !== false || strpos( $slug, '/' ) !== false || strpos( $slug, '\\' ) !== false ) {
		return new WP_Error( 'cb_bad_skill', 'Invalid skill name.' );
	}
	$root = realpath( cb_skills_dir() . '/' . $slug );
	if ( ! $root || ! is_dir( $root ) ) {
		return new WP_Error( 'cb_no_skill', "Skill '$slug' not found." );
	}
	$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
	if ( $rel === '' ) {
		return $root;
	}
	foreach ( explode( '/', $rel ) as $seg ) {
		if ( $seg === '..' || $seg === '.' ) {
			return new WP_Error( 'cb_traversal', 'Path traversal is not allowed.' );
		}
	}
	$real = realpath( $root . '/' . $rel );
	if ( $real === false || strpos( $real, $root ) !== 0 || ! is_file( $real ) ) {
		return new WP_Error( 'cb_no_file', "File '$rel' not found in skill '$slug'." );
	}
	return $real;
}

/** Parse the name/description frontmatter at the top of a SKILL.md. */
function cb_skill_frontmatter( $md ) {
	$out = array( 'name' => '', 'description' => '' );
	if ( ! preg_match( '/^---\s*\n(.*?)\n---/s', (string) $md, $m ) ) {
		return $out;
	}
	if ( preg_match( '/^name:\s*(.+)$/m', $m[1], $n ) ) {
		$out['name'] = trim( $n[1] );
	}
	if ( preg_match( '/^description:\s*(.+)$/m', $m[1], $d ) ) {
		$out['description'] = trim( $d[1] );
	}
	return $out;
}

/** List every bundled skill with its metadata and available files. Cached per-request. */
function cb_skill_list() {
	static $cache = null;
	if ( $cache !== null ) {
		return $cache;
	}
	$dir    = cb_skills_dir();
	$skills = array();
	if ( is_dir( $dir ) ) {
		foreach ( scandir( $dir ) as $slug ) {
			if ( $slug === '.' || $slug === '..' ) {
				continue;
			}
			$base     = $dir . '/' . $slug;
			$skill_md = $base . '/SKILL.md';
			if ( ! is_dir( $base ) || ! is_file( $skill_md ) ) {
				continue;
			}
			$fm    = cb_skill_frontmatter( file_get_contents( $skill_md ) );
			$files = array();
			$it    = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $base, FilesystemIterator::SKIP_DOTS ) );
			foreach ( $it as $f ) {
				if ( $f->isFile() ) {
					$files[] = ltrim( str_replace( '\\', '/', substr( $f->getPathname(), strlen( $base ) ) ), '/' );
				}
			}
			sort( $files );
			$skills[] = array(
				'name'        => $slug,
				'title'       => $fm['name'] !== '' ? $fm['name'] : $slug,
				'description' => $fm['description'],
				'files'       => $files,
			);
		}
	}
	usort( $skills, function ( $a, $b ) {
		return strcmp( $a['name'], $b['name'] );
	} );
	$cache = $skills;
	return $skills;
}

/** Tool op: list all bundled skills. */
function cb_op_list_wp_skills() {
	$skills = cb_skill_list();
	return array(
		'count'  => count( $skills ),
		'usage'  => 'Call get_wp_skill with {"name":"<skill>"} to load a skill\'s SKILL.md, or add {"file":"references/<file>.md"} for a specific reference file. Use the matching skill before reviewing or building WordPress/WooCommerce code.',
		'skills' => $skills,
	);
}

/** Tool op: return the contents of a bundled skill file (SKILL.md by default). */
function cb_op_get_wp_skill( $args ) {
	$slug = isset( $args['name'] ) ? $args['name'] : ( isset( $args['skill'] ) ? $args['skill'] : '' );
	$file = ( isset( $args['file'] ) && $args['file'] !== '' ) ? $args['file'] : 'SKILL.md';
	$path = cb_skill_path( $slug, $file );
	if ( is_wp_error( $path ) ) {
		return $path;
	}
	$content = file_get_contents( $path );
	if ( $content === false ) {
		return new WP_Error( 'cb_read_fail', 'Could not read skill file.' );
	}
	return array(
		'skill'   => (string) $slug,
		'file'    => ltrim( str_replace( '\\', '/', $file ), '/' ),
		'content' => $content,
	);
}

/** Every bundled skill file as an MCP resource descriptor. */
function cb_skill_resources() {
	$res = array();
	foreach ( cb_skill_list() as $s ) {
		foreach ( $s['files'] as $rel ) {
			$res[] = array(
				'uri'      => 'cbskill://' . $s['name'] . '/' . $rel,
				'name'     => $s['name'] . '/' . $rel,
				'title'    => $s['title'] . ' — ' . $rel,
				'mimeType' => ( substr( $rel, -3 ) === '.md' ) ? 'text/markdown' : 'text/plain',
			);
		}
	}
	return $res;
}

/** Read a cbskill:// resource URI. Returns text, or WP_Error. */
function cb_skill_resource_read( $uri ) {
	$uri = (string) $uri;
	if ( strpos( $uri, 'cbskill://' ) !== 0 ) {
		return new WP_Error( 'cb_bad_uri', 'Unknown resource URI.' );
	}
	$rest = substr( $uri, strlen( 'cbskill://' ) );
	$slug = $rest;
	$rel  = 'SKILL.md';
	if ( strpos( $rest, '/' ) !== false ) {
		list( $slug, $rel ) = explode( '/', $rest, 2 );
	}
	$path = cb_skill_path( $slug, $rel );
	if ( is_wp_error( $path ) ) {
		return $path;
	}
	return (string) file_get_contents( $path );
}

/* ============================================================================
 * 6. MCP LAYER  (JSON-RPC 2.0 over HTTP)
 * ========================================================================== */

function cb_check_bearer( $bearer ) {
	$bearer = trim( (string) $bearer );
	if ( $bearer === '' ) {
		return false;
	}
	$token = get_option( CB_TOKEN_OPTION );
	if ( $token && hash_equals( $token, $bearer ) ) {
		cb_become_admin();
		return true;
	}
	$at = get_transient( 'cb_oauth_at_' . $bearer );
	if ( $at && ! empty( $at['user_id'] ) ) {
		// Tokens minted via the native Application Password flow honour revocation:
		// removing the Application Password in wp-admin instantly cuts Claude's access.
		if ( ! empty( $at['app_password'] ) && ! cb_app_password_valid( (int) $at['user_id'], $at['app_password'] ) ) {
			return false;
		}
		wp_set_current_user( (int) $at['user_id'] );
		return true;
	}
	return false;
}

function cb_mcp_authorized( $request ) {
	// Connector mode: ONLY hub-signed requests pass — nothing direct.
	if ( cb_connector_enabled() ) {
		return cb_connector_request_signed();
	}
	if ( current_user_can( 'edit_themes' ) ) {
		return true;
	}
	// (a) Header: Authorization: Bearer <token>
	$auth = $request->get_header( 'authorization' );
	if ( $auth && preg_match( '/Bearer\s+(.+)/i', $auth, $m ) && cb_check_bearer( $m[1] ) ) {
		return true;
	}
	// (b) Query param ?token=<token> — for clients that cannot send custom headers.
	$qt = $request->get_param( 'token' );
	if ( ! $qt && isset( $_GET['token'] ) ) {
		$qt = sanitize_text_field( wp_unslash( $_GET['token'] ) );
	}
	if ( $qt && cb_check_bearer( $qt ) ) {
		return true;
	}
	return false;
}

function cb_rpc( $id, $result ) {
	return new WP_REST_Response( array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => $result ) );
}
function cb_rpc_error( $id, $code, $message ) {
	return new WP_REST_Response( array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => $code, 'message' => $message ) ) );
}

/**
 * Primary transport: REST POST at claude-bridge/v1/mcp (and /sse, /rpc aliases).
 * Returns JSON by default (unchanged contract). Opts into SSE only when the
 * caller explicitly asks (?transport=sse or an SSE-only Accept header).
 */
function cb_mcp_handler( $request ) {
	if ( ! cb_mcp_authorized( $request ) ) {
		$resp = new WP_REST_Response( array( 'jsonrpc' => '2.0', 'id' => null, 'error' => array( 'code' => -32001, 'message' => 'Unauthorized.' ) ), 401 );
		$resp->header( 'WWW-Authenticate', 'Bearer resource_metadata="' . esc_url_raw( home_url( '/.well-known/oauth-protected-resource' ) ) . '"' );
		return $resp;
	}
	$out = cb_mcp_dispatch( $request->get_json_params() );
	if ( $out === null ) {
		return new WP_REST_Response( null, 202 ); // notification: no response body
	}
	if ( cb_wants_sse( $request ) ) {
		cb_mcp_emit_sse( $out ); // emits an SSE stream and exits
	}
	return new WP_REST_Response( $out );
}

/** GET on an MCP endpoint: describe the server and its connection modes (never 405). */
function cb_mcp_get_info() {
	return new WP_REST_Response( array(
		'server'    => 'wp-claude-bridge',
		'version'   => CB_VERSION,
		'transport' => 'POST JSON-RPC 2.0. JSON response by default; append ?transport=sse for a Server-Sent-Events response.',
		'endpoints' => array(
			'rest'       => rest_url( 'claude-bridge/v1/mcp' ),
			'rest_alias' => array( rest_url( 'claude-bridge/v1/sse' ), rest_url( 'claude-bridge/v1/rpc' ) ),
			'admin_ajax' => admin_url( 'admin-ajax.php?action=cb_mcp' ),
			'query_var'  => home_url( '/?cb_mcp=1' ),
		),
		'auth'      => array( 'Authorization: Bearer <token>', '?token=<token>', 'OAuth (Application Passwords)', 'logged-in admin cookie' ),
	), 200 );
}

/** True when the caller explicitly opts into an SSE (text/event-stream) response. */
function cb_wants_sse( $request = null ) {
	if ( isset( $_GET['transport'] ) && strtolower( sanitize_text_field( wp_unslash( $_GET['transport'] ) ) ) === 'sse' ) {
		return true;
	}
	$accept = '';
	if ( $request instanceof WP_REST_Request ) {
		$accept = (string) $request->get_header( 'accept' );
	} elseif ( isset( $_SERVER['HTTP_ACCEPT'] ) ) {
		$accept = (string) $_SERVER['HTTP_ACCEPT'];
	}
	// Only for SSE-only clients (accept event-stream but not plain JSON), so the
	// existing JSON contract used by current connectors is never altered.
	return ( stripos( $accept, 'text/event-stream' ) !== false && stripos( $accept, 'application/json' ) === false );
}

/** Emit one JSON-RPC payload as a single-event SSE stream, then exit. */
function cb_mcp_emit_sse( $payload ) {
	if ( function_exists( 'nocache_headers' ) ) {
		nocache_headers();
	}
	while ( ob_get_level() > 0 ) {
		ob_end_clean();
	}
	header( 'Content-Type: text/event-stream; charset=utf-8' );
	header( 'Cache-Control: no-cache, no-transform' );
	header( 'Connection: keep-alive' );
	header( 'X-Accel-Buffering: no' );
	header( 'Access-Control-Allow-Origin: *' );
	echo 'event: message' . "\n";
	echo 'data: ' . wp_json_encode( $payload ) . "\n\n";
	@ob_flush();
	@flush();
	exit;
}

/**
 * Transport-agnostic JSON-RPC 2.0 dispatcher. Assumes the caller is already
 * authorized. Returns the response array, or null for a notification.
 */
function cb_mcp_dispatch( $body ) {
	$id     = ( is_array( $body ) && isset( $body['id'] ) ) ? $body['id'] : null;
	$method = ( is_array( $body ) && isset( $body['method'] ) ) ? $body['method'] : '';
	$params = ( is_array( $body ) && isset( $body['params'] ) && is_array( $body['params'] ) ) ? $body['params'] : array();

	if ( is_string( $method ) && strpos( $method, 'notifications/' ) === 0 ) {
		return null;
	}

	switch ( $method ) {
		case 'initialize':
			$ver = ( isset( $params['protocolVersion'] ) && is_string( $params['protocolVersion'] ) && $params['protocolVersion'] !== '' )
				? $params['protocolVersion'] : '2024-11-05';
			return array(
				'jsonrpc' => '2.0',
				'id'      => $id,
				'result'  => array(
					'protocolVersion' => $ver,
					'capabilities'    => array(
						'tools'     => new stdClass(),
						'resources' => new stdClass(),
						'prompts'   => new stdClass(),
					),
					'serverInfo'      => array( 'name' => 'wp-claude-bridge', 'version' => CB_VERSION ),
				),
			);

		case 'ping':
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => new stdClass() );

		case 'tools/list':
			$tools = array();
			foreach ( cb_tools() as $t ) {
				$tools[] = array( 'name' => $t['name'], 'description' => $t['description'], 'inputSchema' => $t['inputSchema'] );
			}
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'tools' => $tools ) );

		case 'tools/call':
			$name = isset( $params['name'] ) ? $params['name'] : '';
			$args = isset( $params['arguments'] ) ? (array) $params['arguments'] : array();
			cb_activity_channel( 'mcp' );
			$res  = cb_run_tool( $name, $args );
			if ( is_wp_error( $res ) ) {
				return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'isError' => true, 'content' => array( array( 'type' => 'text', 'text' => $res->get_error_message() ) ) ) );
			}
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'content' => array( array( 'type' => 'text', 'text' => wp_json_encode( $res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) ) ) );

		case 'resources/list':
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'resources' => cb_skill_resources() ) );

		case 'resources/read':
			$uri = isset( $params['uri'] ) ? $params['uri'] : '';
			$txt = cb_skill_resource_read( $uri );
			if ( is_wp_error( $txt ) ) {
				return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32602, 'message' => $txt->get_error_message() ) );
			}
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'contents' => array( array( 'uri' => (string) $uri, 'mimeType' => 'text/markdown', 'text' => $txt ) ) ) );

		case 'prompts/list':
			$prompts = array();
			foreach ( cb_skill_list() as $s ) {
				$prompts[] = array( 'name' => $s['name'], 'title' => $s['title'], 'description' => $s['description'] );
			}
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array( 'prompts' => $prompts ) );

		case 'prompts/get':
			$pname = isset( $params['name'] ) ? $params['name'] : '';
			$path  = cb_skill_path( $pname, 'SKILL.md' );
			if ( is_wp_error( $path ) ) {
				return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32602, 'message' => $path->get_error_message() ) );
			}
			return array( 'jsonrpc' => '2.0', 'id' => $id, 'result' => array(
				'description' => 'WordPress skill: ' . (string) $pname,
				'messages'    => array( array(
					'role'    => 'user',
					'content' => array( 'type' => 'text', 'text' => (string) file_get_contents( $path ) ),
				) ),
			) );
	}

	return array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32601, 'message' => "Unknown method: $method" ) );
}

/** Read the Authorization header across SAPIs (for the non-REST transports). */
function cb_raw_auth_header() {
	if ( ! empty( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
		return $_SERVER['HTTP_AUTHORIZATION'];
	}
	if ( ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
		return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
	}
	if ( function_exists( 'getallheaders' ) ) {
		foreach ( (array) getallheaders() as $k => $v ) {
			if ( strtolower( $k ) === 'authorization' ) {
				return $v;
			}
		}
	}
	return '';
}

/** Authorize a request that did NOT arrive through the REST controller. */
function cb_mcp_authorized_any() {
	// Connector mode: ONLY hub-signed requests pass — nothing direct.
	if ( cb_connector_enabled() ) {
		return cb_connector_request_signed();
	}
	if ( current_user_can( 'edit_themes' ) ) {
		return true;
	}
	$auth = cb_raw_auth_header();
	if ( $auth && preg_match( '/Bearer\s+(.+)/i', $auth, $m ) && cb_check_bearer( trim( $m[1] ) ) ) {
		return true;
	}
	if ( ! empty( $_GET['token'] ) && cb_check_bearer( sanitize_text_field( wp_unslash( $_GET['token'] ) ) ) ) {
		return true;
	}
	if ( ! empty( $_POST['token'] ) && cb_check_bearer( sanitize_text_field( wp_unslash( $_POST['token'] ) ) ) ) {
		return true;
	}
	return false;
}

/* ============================================================================
 * 5c. HUB CONNECTOR MODE  (optional; OFF by default)
 * ----------------------------------------------------------------------------
 * When enabled, this plugin stops being a directly-operable MCP endpoint.
 * Every MCP request must be signed by the paired hub server (HMAC-SHA256 over
 * timestamp + raw body with a shared secret); direct token / Application
 * Password / logged-in access is refused. The plugin becomes a pure bridge:
 * things only happen through YOUR server (the "واسط"), never on the site
 * directly. Backward-compatible — existing installs are unaffected until an
 * admin turns it on under Tools -> Claude Bridge.
 * ========================================================================== */

/** Current connector config, with defaults. */
function cb_connector() {
	$d = array( 'enabled' => false, 'server_url' => '', 'secret' => '', 'site_id' => '', 'paired_at' => 0 );
	$c = get_option( CB_CONNECTOR_OPTION );
	return is_array( $c ) ? array_merge( $d, $c ) : $d;
}

/** True when connector mode is active and a shared secret is present. */
function cb_connector_enabled() {
	$c = cb_connector();
	return ! empty( $c['enabled'] ) && ! empty( $c['secret'] );
}

/** Read a request header across SAPIs. */
function cb_connector_header( $name ) {
	$key = 'HTTP_' . strtoupper( str_replace( '-', '_', $name ) );
	if ( ! empty( $_SERVER[ $key ] ) ) {
		return trim( (string) wp_unslash( $_SERVER[ $key ] ) );
	}
	if ( function_exists( 'getallheaders' ) ) {
		foreach ( getallheaders() as $k => $v ) {
			if ( strtolower( $k ) === strtolower( $name ) ) {
				return trim( (string) $v );
			}
		}
	}
	return '';
}

/** Verify the current request was signed by the paired hub server. */
function cb_connector_request_signed() {
	$c = cb_connector();
	if ( empty( $c['secret'] ) ) {
		return false;
	}
	$ts  = cb_connector_header( 'X-DigiWP-Timestamp' );
	$sig = cb_connector_header( 'X-DigiWP-Signature' );
	if ( ! $ts || ! $sig ) {
		return false;
	}
	if ( abs( time() - (int) $ts ) > 300 ) { // 5-minute replay window
		return false;
	}
	$body     = file_get_contents( 'php://input' );
	$expected = hash_hmac( 'sha256', $ts . "\n" . $body, $c['secret'] );
	return hash_equals( $expected, (string) $sig );
}

/** Sign an outbound payload to YOUR server the same way (register / heartbeat). */
function cb_connector_sign( $body ) {
	$c  = cb_connector();
	$ts = (string) time();
	return array(
		'X-DigiWP-Timestamp' => $ts,
		'X-DigiWP-Signature' => hash_hmac( 'sha256', $ts . "\n" . $body, $c['secret'] ),
		'X-DigiWP-Site'      => $c['site_id'],
	);
}

/** Announce this site to the hub server (opt-in, best-effort). */
function cb_connector_register() {
	$c = cb_connector();
	if ( empty( $c['enabled'] ) || empty( $c['server_url'] ) || empty( $c['secret'] ) ) {
		return new WP_Error( 'cb_connector', 'Connector not configured.' );
	}
	$payload = wp_json_encode( array(
		'site_id'  => $c['site_id'],
		'site_url' => home_url(),
		'name'     => get_bloginfo( 'name' ),
		'version'  => CB_VERSION,
		'wp'       => get_bloginfo( 'version' ),
	) );
	$res = wp_remote_post( untrailingslashit( $c['server_url'] ) . '/connector/register', array(
		'timeout' => 15,
		'headers' => array_merge( array( 'Content-Type' => 'application/json' ), cb_connector_sign( $payload ) ),
		'body'    => $payload,
	) );
	return is_wp_error( $res ) ? $res : array( 'status' => wp_remote_retrieve_response_code( $res ) );
}

/**
 * Shared entry point for the fallback transports (admin-ajax action and the
 * query-var endpoint). Reads the raw JSON-RPC body, authorizes, dispatches,
 * and prints the response as JSON (or SSE on request), then exits.
 */
function cb_mcp_run_raw() {
	if ( ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : 'GET' ) === 'OPTIONS' ) {
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
		header( 'Access-Control-Allow-Headers: Authorization, Content-Type, Accept' );
		status_header( 204 );
		exit;
	}

	$raw  = file_get_contents( 'php://input' );
	$body = json_decode( $raw, true );
	$id   = ( is_array( $body ) && isset( $body['id'] ) ) ? $body['id'] : null;

	if ( ! cb_mcp_authorized_any() ) {
		status_header( 401 );
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'WWW-Authenticate: Bearer resource_metadata="' . esc_url_raw( home_url( '/.well-known/oauth-protected-resource' ) ) . '"' );
		echo wp_json_encode( array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32001, 'message' => 'Unauthorized.' ) ) );
		exit;
	}

	if ( ! is_array( $body ) ) {
		status_header( 400 );
		header( 'Content-Type: application/json; charset=utf-8' );
		echo wp_json_encode( array( 'jsonrpc' => '2.0', 'id' => null, 'error' => array( 'code' => -32700, 'message' => 'Parse error.' ) ) );
		exit;
	}

	$out = cb_mcp_dispatch( $body );
	if ( $out === null ) {
		status_header( 202 );
		exit;
	}
	if ( cb_wants_sse() ) {
		cb_mcp_emit_sse( $out );
	}
	status_header( 200 );
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Access-Control-Allow-Origin: *' );
	echo wp_json_encode( $out );
	exit;
}

/* ============================================================================
 * 7. OAUTH 2.1 + PKCE + DYNAMIC CLIENT REGISTRATION  (connector login flow)
 * The client only needs the MCP URL: it discovers the auth server, registers,
 * sends you through wp-login + a consent screen, and receives an access token.
 * ========================================================================== */

function cb_b64url( $bin ) {
	return rtrim( strtr( base64_encode( $bin ), '+/', '-_' ), '=' );
}
function cb_issuer() {
	return untrailingslashit( home_url() );
}
function cb_oauth_json( $data, $status = 200 ) {
	status_header( $status );
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Access-Control-Allow-Origin: *' );
	header( 'Cache-Control: no-store' );
	echo wp_json_encode( $data );
	exit;
}
function cb_request_url() {
	$scheme = is_ssl() ? 'https' : 'http';
	return $scheme . '://' . ( isset( $_SERVER['HTTP_HOST'] ) ? $_SERVER['HTTP_HOST'] : '' ) . ( isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '' );
}

add_action( 'init', 'cb_oauth_router', 1 );
function cb_oauth_router() {
	$path = parse_url( isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH );
	if ( ! $path ) {
		return;
	}
	$path = '/' . trim( $path, '/' );

	if ( $path === '/.well-known/oauth-authorization-server' ) {
		cb_oauth_json( array(
			'issuer'                                => cb_issuer(),
			'authorization_endpoint'                => home_url( '/claude-bridge-oauth/authorize' ),
			'token_endpoint'                        => home_url( '/claude-bridge-oauth/token' ),
			'registration_endpoint'                 => home_url( '/claude-bridge-oauth/register' ),
			'response_types_supported'              => array( 'code' ),
			'grant_types_supported'                 => array( 'authorization_code', 'refresh_token' ),
			'code_challenge_methods_supported'      => array( 'S256' ),
			'token_endpoint_auth_methods_supported' => array( 'none', 'client_secret_post' ),
			'scopes_supported'                      => array( 'mcp' ),
		) );
	}
	if ( $path === '/.well-known/oauth-protected-resource' ) {
		cb_oauth_json( array(
			'resource'                 => rest_url( 'claude-bridge/v1/mcp' ),
			'authorization_servers'    => array( cb_issuer() ),
			'bearer_methods_supported' => array( 'header' ),
			'scopes_supported'         => array( 'mcp' ),
		) );
	}

	if ( strpos( $path, '/claude-bridge-oauth/' ) === 0 ) {
		if ( ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : 'GET' ) === 'OPTIONS' ) {
			header( 'Access-Control-Allow-Origin: *' );
			header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
			header( 'Access-Control-Allow-Headers: Authorization, Content-Type' );
			status_header( 204 );
			exit;
		}
		$ep = substr( $path, strlen( '/claude-bridge-oauth/' ) );
		if ( $ep === 'register' ) {
			cb_oauth_register();
		} elseif ( $ep === 'authorize' ) {
			cb_oauth_authorize();
		} elseif ( $ep === 'app-return' ) {
			cb_oauth_app_return();
		} elseif ( $ep === 'token' ) {
			cb_oauth_token();
		}
	}
}

function cb_oauth_register() {
	$raw       = file_get_contents( 'php://input' );
	$body      = json_decode( $raw, true );
	$redirects = ( $body && ! empty( $body['redirect_uris'] ) ) ? (array) $body['redirect_uris'] : array();
	if ( empty( $redirects ) ) {
		cb_oauth_json( array( 'error' => 'invalid_client_metadata', 'error_description' => 'redirect_uris required' ), 400 );
	}
	$client_id = 'cb_' . wp_generate_password( 24, false );
	$clients   = get_option( CB_CLIENTS_OPTION, array() );
	$clients[ $client_id ] = array(
		'redirect_uris' => array_map( 'esc_url_raw', $redirects ),
		'name'          => isset( $body['client_name'] ) ? sanitize_text_field( $body['client_name'] ) : 'MCP Client',
		'created'       => time(),
	);
	update_option( CB_CLIENTS_OPTION, $clients, false );
	cb_oauth_json( array(
		'client_id'                  => $client_id,
		'redirect_uris'              => $clients[ $client_id ]['redirect_uris'],
		'token_endpoint_auth_method' => 'none',
		'grant_types'                => array( 'authorization_code', 'refresh_token' ),
		'response_types'             => array( 'code' ),
		'client_name'                => $clients[ $client_id ]['name'],
	), 201 );
}

function cb_oauth_authorize() {
	$client_id = isset( $_REQUEST['client_id'] ) ? sanitize_text_field( $_REQUEST['client_id'] ) : '';
	$redirect  = isset( $_REQUEST['redirect_uri'] ) ? esc_url_raw( $_REQUEST['redirect_uri'] ) : '';
	$state     = isset( $_REQUEST['state'] ) ? $_REQUEST['state'] : '';
	$challenge = isset( $_REQUEST['code_challenge'] ) ? sanitize_text_field( $_REQUEST['code_challenge'] ) : '';
	$cmethod   = isset( $_REQUEST['code_challenge_method'] ) ? sanitize_text_field( $_REQUEST['code_challenge_method'] ) : '';

	$clients = get_option( CB_CLIENTS_OPTION, array() );
	if ( ! $client_id || ! isset( $clients[ $client_id ] ) ) {
		wp_die( 'Unknown client_id.' );
	}
	if ( ! in_array( $redirect, $clients[ $client_id ]['redirect_uris'], true ) ) {
		wp_die( 'redirect_uri does not match the registered client.' );
	}
	$redir_err = function ( $code ) use ( $redirect, $state ) {
		$sep = ( strpos( $redirect, '?' ) !== false ) ? '&' : '?';
		wp_redirect( $redirect . $sep . 'error=' . rawurlencode( $code ) . '&state=' . rawurlencode( $state ) );
		exit;
	};
	if ( $cmethod !== 'S256' || ! $challenge ) {
		$redir_err( 'invalid_request' );
	}

	// Preferred consent: delegate to WordPress's native Application Passwords screen
	// (the same structure WPVibe uses). Access becomes a real, revocable Application
	// Password. Falls back to the built-in consent screen below if unavailable.
	if ( function_exists( 'wp_is_application_passwords_available' ) && wp_is_application_passwords_available() ) {
		$ap = wp_generate_password( 32, false );
		set_transient( 'cb_oauth_pending_' . $ap, array(
			'client_id' => $client_id,
			'redirect'  => $redirect,
			'state'     => $state,
			'challenge' => $challenge,
		), 15 * MINUTE_IN_SECONDS );
		$return  = add_query_arg( 'cb_ap', $ap, home_url( '/claude-bridge-oauth/app-return' ) );
		$connect = add_query_arg( array(
			'app_name'    => 'Claude (' . $clients[ $client_id ]['name'] . ')',
			'success_url' => $return,
			'reject_url'  => add_query_arg( 'cb_denied', '1', $return ),
		), admin_url( 'authorize-application.php' ) );
		wp_redirect( $connect );
		exit;
	}

	if ( ! is_user_logged_in() ) {
		wp_redirect( wp_login_url( cb_request_url() ) );
		exit;
	}
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'You must be logged in as an administrator to authorize this connection.' );
	}

	if ( ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) === 'POST' && isset( $_POST['cb_consent'] ) ) {
		check_admin_referer( 'cb_oauth_consent' );
		if ( $_POST['cb_consent'] === 'approve' ) {
			$code = wp_generate_password( 40, false );
			set_transient( 'cb_oauth_code_' . $code, array(
				'client_id'    => $client_id,
				'redirect_uri' => $redirect,
				'challenge'    => $challenge,
				'user_id'      => get_current_user_id(),
			), 300 );
			$sep = ( strpos( $redirect, '?' ) !== false ) ? '&' : '?';
			wp_redirect( $redirect . $sep . 'code=' . rawurlencode( $code ) . '&state=' . rawurlencode( $state ) );
			exit;
		}
		$redir_err( 'access_denied' );
	}

	$user = wp_get_current_user();
	nocache_headers();
	?>
	<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>اتصال به Claude</title>
	<style>body{font-family:Tahoma,system-ui,sans-serif;background:#f3f4f6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
	.box{background:#fff;max-width:420px;width:90%;padding:32px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.12);text-align:center}
	h1{font-size:20px;margin:0 0 10px}p{color:#555;font-size:14px;line-height:1.8}
	.who{background:#f3f4f6;border-radius:10px;padding:10px;margin:18px 0;font-size:13px}
	button{font:inherit;border:0;border-radius:10px;padding:12px 22px;cursor:pointer;font-weight:700;margin:4px}
	.ok{background:#2563eb;color:#fff}.no{background:#e5e7eb;color:#333}</style></head>
	<body><form class="box" method="post">
	<?php wp_nonce_field( 'cb_oauth_consent' ); ?>
	<h1>اجازه‌ی اتصال</h1>
	<p>برنامه‌ی <b><?php echo esc_html( $clients[ $client_id ]['name'] ); ?></b> می‌خواهد با دسترسی مدیریتی به سایت شما وصل شود (قالب، پلاگین، محصولات، سفارش‌ها و تنظیمات).</p>
	<div class="who">ورود به‌عنوان: <b><?php echo esc_html( $user->user_login ); ?></b></div>
	<button class="ok" name="cb_consent" value="approve" type="submit">تأیید و اتصال</button>
	<button class="no" name="cb_consent" value="deny" type="submit">رد</button>
	</form></body></html>
	<?php
	exit;
}

/**
 * Return point for WordPress's native Application Passwords screen. WordPress sends
 * the approving user + a freshly minted application password here; we verify it, then
 * hand Claude a normal OAuth authorization code bound to that user.
 */
function cb_oauth_app_return() {
	$ap      = isset( $_GET['cb_ap'] ) ? sanitize_text_field( wp_unslash( $_GET['cb_ap'] ) ) : '';
	$pending = $ap ? get_transient( 'cb_oauth_pending_' . $ap ) : false;
	if ( ! $pending ) {
		wp_die( 'This authorization request has expired. Please start the connection from Claude again.' );
	}
	delete_transient( 'cb_oauth_pending_' . $ap );

	$redirect = $pending['redirect'];
	$state    = $pending['state'];
	$sep      = ( strpos( $redirect, '?' ) !== false ) ? '&' : '?';
	$fail     = function ( $err ) use ( $redirect, $sep, $state ) {
		wp_redirect( $redirect . $sep . 'error=' . rawurlencode( $err ) . '&state=' . rawurlencode( $state ) );
		exit;
	};

	if ( ! empty( $_GET['cb_denied'] ) || empty( $_GET['password'] ) || empty( $_GET['user_login'] ) ) {
		$fail( 'access_denied' );
	}

	$user = get_user_by( 'login', sanitize_user( wp_unslash( $_GET['user_login'] ) ) );
	if ( ! $user || ! user_can( $user, 'edit_themes' ) ) {
		$fail( 'access_denied' );
	}

	// Verify the application password really belongs to this user (prevents forgery).
	$raw = str_replace( ' ', '', (string) wp_unslash( $_GET['password'] ) );
	if ( ! cb_app_password_valid( $user->ID, $raw ) ) {
		$fail( 'access_denied' );
	}

	$code = wp_generate_password( 40, false );
	set_transient( 'cb_oauth_code_' . $code, array(
		'client_id'    => $pending['client_id'],
		'redirect_uri' => $redirect,
		'challenge'    => $pending['challenge'],
		'user_id'      => $user->ID,
		'app_password' => $raw,
	), 300 );

	wp_redirect( $redirect . $sep . 'code=' . rawurlencode( $code ) . '&state=' . rawurlencode( $state ) );
	exit;
}

/** True if $raw is currently a valid Application Password for the user (honours revocation). */
function cb_app_password_valid( $user_id, $raw ) {
	if ( ! class_exists( 'WP_Application_Passwords' ) ) {
		return true; // Can't verify on very old cores; don't lock the user out.
	}
	$raw = str_replace( ' ', '', (string) $raw );
	foreach ( WP_Application_Passwords::get_user_application_passwords( (int) $user_id ) as $item ) {
		if ( ! empty( $item['password'] ) && wp_check_password( $raw, $item['password'], $user_id ) ) {
			return true;
		}
	}
	return false;
}

function cb_oauth_token() {
	$p = $_POST;
	if ( empty( $p ) ) {
		$raw = file_get_contents( 'php://input' );
		parse_str( $raw, $p );
		if ( empty( $p['grant_type'] ) ) {
			$j = json_decode( $raw, true );
			if ( is_array( $j ) ) {
				$p = $j;
			}
		}
	}
	$grant = isset( $p['grant_type'] ) ? $p['grant_type'] : '';

	if ( $grant === 'authorization_code' ) {
		$code     = isset( $p['code'] ) ? $p['code'] : '';
		$verifier = isset( $p['code_verifier'] ) ? $p['code_verifier'] : '';
		$client   = isset( $p['client_id'] ) ? $p['client_id'] : '';
		$data     = get_transient( 'cb_oauth_code_' . $code );
		if ( ! $data ) {
			cb_oauth_json( array( 'error' => 'invalid_grant' ), 400 );
		}
		delete_transient( 'cb_oauth_code_' . $code );
		if ( $data['client_id'] !== $client ) {
			cb_oauth_json( array( 'error' => 'invalid_client' ), 400 );
		}
		if ( ! hash_equals( $data['challenge'], cb_b64url( hash( 'sha256', $verifier, true ) ) ) ) {
			cb_oauth_json( array( 'error' => 'invalid_grant', 'error_description' => 'PKCE verification failed' ), 400 );
		}
		cb_oauth_issue( $data['user_id'], $client, isset( $data['app_password'] ) ? $data['app_password'] : '' );
	} elseif ( $grant === 'refresh_token' ) {
		$rt = isset( $p['refresh_token'] ) ? $p['refresh_token'] : '';
		$rd = get_transient( 'cb_oauth_rt_' . $rt );
		if ( ! $rd ) {
			cb_oauth_json( array( 'error' => 'invalid_grant' ), 400 );
		}
		delete_transient( 'cb_oauth_rt_' . $rt );
		cb_oauth_issue( $rd['user_id'], $rd['client_id'], isset( $rd['app_password'] ) ? $rd['app_password'] : '' );
	}
	cb_oauth_json( array( 'error' => 'unsupported_grant_type' ), 400 );
}

function cb_oauth_issue( $user_id, $client_id, $app_password = '' ) {
	$at   = wp_generate_password( 64, false );
	$rt   = wp_generate_password( 64, false );
	$ttl  = 30 * DAY_IN_SECONDS;
	$meta = array( 'user_id' => (int) $user_id, 'client_id' => $client_id );
	if ( $app_password !== '' ) {
		$meta['app_password'] = $app_password;
	}
	set_transient( 'cb_oauth_at_' . $at, $meta, $ttl );
	set_transient( 'cb_oauth_rt_' . $rt, $meta, 90 * DAY_IN_SECONDS );
	cb_oauth_json( array(
		'access_token'  => $at,
		'token_type'    => 'Bearer',
		'expires_in'    => $ttl,
		'refresh_token' => $rt,
		'scope'         => 'mcp',
	) );
}

/* ============================================================================
 * 8. ADMIN SETTINGS PAGE
 * ========================================================================== */

add_action( 'admin_menu', function () {
	add_management_page( 'Claude Bridge', 'Claude Bridge', 'manage_options', 'claude-bridge', 'cb_settings_page' );
} );

add_action( 'admin_init', function () {
	if ( isset( $_POST['cb_regen'] ) && check_admin_referer( 'cb_regen' ) && current_user_can( 'manage_options' ) ) {
		update_option( CB_TOKEN_OPTION, wp_generate_password( 48, false ) );
	}
	if ( isset( $_POST['cb_connector_save'] ) && check_admin_referer( 'cb_connector' ) && current_user_can( 'manage_options' ) ) {
		$c            = cb_connector();
		$c['enabled'] = ! empty( $_POST['cb_conn_enabled'] );
		$c['server_url'] = isset( $_POST['cb_conn_server'] ) ? esc_url_raw( wp_unslash( $_POST['cb_conn_server'] ) ) : '';
		$secret = isset( $_POST['cb_conn_secret'] ) ? sanitize_text_field( wp_unslash( $_POST['cb_conn_secret'] ) ) : '';
		if ( $secret !== '' ) {
			$c['secret'] = $secret;
		}
		if ( empty( $c['site_id'] ) ) {
			$c['site_id'] = wp_generate_password( 20, false );
		}
		if ( $c['enabled'] && empty( $c['paired_at'] ) ) {
			$c['paired_at'] = time();
		}
		update_option( CB_CONNECTOR_OPTION, $c );

		// Optional: announce this site to the hub right away.
		if ( ! empty( $_POST['cb_conn_register'] ) ) {
			cb_connector_register();
		}
	}
	if ( isset( $_POST['cb_activity_save'] ) && check_admin_referer( 'cb_activity' ) && current_user_can( 'manage_options' ) ) {
		update_option( CB_ACTIVITY_OPTION_ON, empty( $_POST['cb_activity_on'] ) ? '0' : '1', false );
		if ( ! empty( $_POST['cb_activity_clear'] ) ) {
			cb_activity_clear();
		}
	}
} );

function cb_settings_page() {
	$token = get_option( CB_TOKEN_OPTION );
	if ( ! $token ) {
		$token = wp_generate_password( 48, false );
		update_option( CB_TOKEN_OPTION, $token );
	}
	$mcp     = rest_url( 'claude-bridge/v1/mcp' );
	$mcp_tok = add_query_arg( 'token', $token, $mcp );
	?>
	<div class="wrap">
		<h1>WP Claude Bridge <span style="font-size:13px;color:#888">v<?php echo esc_html( CB_VERSION ); ?></span></h1>
		<p>This site is now a self-hosted MCP server: theme &amp; plugin file editing, plugin creation, theme/plugin activation, preview, cache, and full WordPress + WooCommerce control (90+ tools).</p>

		<h2 style="margin-top:24px">✅ Easiest: connect with token in the URL (no header)</h2>
		<p>In Claude, add a <b>Custom Connector</b> and paste this single URL. Nothing else to configure — the token is built in.</p>
		<p><input type="text" readonly onclick="this.select()" style="width:100%;max-width:760px;padding:10px;font-family:monospace;font-size:13px" value="<?php echo esc_attr( $mcp_tok ); ?>"></p>
		<p class="description">Keep this URL secret — anyone with it has admin access. Regenerate the token below to revoke.</p>

		<h2 style="margin-top:24px">Alternative: OAuth via native Application Passwords</h2>
		<p>Add a Custom Connector with the plain URL below. Claude sends you to WordPress's own <b>Authorize Application</b> screen (one click, no header). Access is a standard Application Password you can revoke any time under <b>Users &rarr; Profile &rarr; Application Passwords</b>.</p>
		<p><code style="font-size:13px;padding:6px;background:#f6f7f7;display:inline-block"><?php echo esc_html( $mcp ); ?></code></p>

		<h2 style="margin-top:24px">Alternative: Bearer header</h2>
		<table class="form-table">
			<tr><th>URL</th><td><code><?php echo esc_html( $mcp ); ?></code></td></tr>
			<tr><th>Header</th><td><code>Authorization: Bearer <?php echo esc_html( $token ); ?></code></td></tr>
		</table>
		<h2 style="margin-top:24px">Bundled WordPress skills</h2>
		<p>This plugin ships <b><?php echo count( cb_skill_list() ); ?></b> WordPress engineering skills. The connected model lists them with the <code>list_wp_skills</code> tool and loads any one with <code>get_wp_skill</code> — also exposed as MCP <b>resources</b> and <b>prompts</b>. No setup required.</p>
		<p class="description"><?php echo esc_html( implode( ', ', wp_list_pluck( cb_skill_list(), 'name' ) ) ); ?></p>

		<h2 style="margin-top:24px">📕 Cookbook</h2>
		<p>The plugin ships <b><?php echo count( cb_cookbook_recipes() ); ?></b> ready-to-paste recipes — the jobs people actually hand to an AI on a WordPress site, each written for the tools above. The ones that fit this site's stack also show on your <b>Dashboard</b>. The connected model can read them itself with <code>list_recipes</code> and <code>get_recipe</code>.</p>
		<p><a href="<?php echo esc_url( cb_cookbook_url() ); ?>" class="button">Browse the cookbook</a></p>

		<h2 style="margin-top:24px">Connection modes (built-in fallback)</h2>
		<p>All endpoints below speak the same MCP protocol and accept the same token. If a host, security plugin, or proxy blocks one, point Claude at another:</p>
		<table class="form-table">
			<tr><th>Primary (REST)</th><td><code><?php echo esc_html( $mcp ); ?></code></td></tr>
			<tr><th>REST aliases</th><td><code><?php echo esc_html( rest_url( 'claude-bridge/v1/sse' ) ); ?></code> · <code><?php echo esc_html( rest_url( 'claude-bridge/v1/rpc' ) ); ?></code></td></tr>
			<tr><th>admin-ajax</th><td><code><?php echo esc_html( admin_url( 'admin-ajax.php?action=cb_mcp' ) ); ?></code> <span class="description">— when <code>/wp-json/</code> REST routes are disabled</span></td></tr>
			<tr><th>Query-var</th><td><code><?php echo esc_html( home_url( '/?cb_mcp=1' ) ); ?></code> <span class="description">— when the REST API is fully off</span></td></tr>
			<tr><th>Response format</th><td>JSON by default · append <code>&amp;transport=sse</code> for Server-Sent Events</td></tr>
		</table>
		<p class="description">If your host strips the <code>Authorization</code> header, append <code>?token=…</code> (or <code>&amp;token=…</code>) to any endpoint above.</p>

		<form method="post"><?php wp_nonce_field( 'cb_regen' ); ?>
			<input type="hidden" name="cb_regen" value="1"><?php submit_button( 'Regenerate token', 'secondary' ); ?>
		</form>

		<hr style="margin:28px 0">
		<h2>🔗 Hub Connector Mode <span style="font-size:12px;color:#888">— route everything through your server</span></h2>
		<?php $conn = cb_connector(); ?>
		<p>Turn this plugin into a <b>bridge</b> instead of a directly-operable endpoint. When on, this site accepts MCP requests <b>only</b> when they are signed by your paired hub server — direct token, Application&nbsp;Password and logged-in access are refused. Nothing happens on the site except through <b>your</b> server (the واسط).</p>
		<?php if ( cb_connector_enabled() ) : ?>
			<div class="notice notice-success inline" style="margin:10px 0;padding:10px 12px"><b>Connector mode is ON.</b> Direct MCP endpoints are locked; only <code><?php echo esc_html( $conn['server_url'] ?: 'your hub server' ); ?></code> can operate this site (HMAC-signed).</div>
		<?php else : ?>
			<div class="notice notice-info inline" style="margin:10px 0;padding:10px 12px">Connector mode is <b>off</b> — this site still works as a standalone MCP server via the URLs above.</div>
		<?php endif; ?>
		<form method="post"><?php wp_nonce_field( 'cb_connector' ); ?>
			<input type="hidden" name="cb_connector_save" value="1">
			<table class="form-table">
				<tr><th scope="row">Enable connector mode</th><td>
					<label><input type="checkbox" name="cb_conn_enabled" value="1" <?php checked( ! empty( $conn['enabled'] ) ); ?>> Only accept commands signed by my hub server</label>
				</td></tr>
				<tr><th scope="row">Hub server URL</th><td>
					<input type="url" name="cb_conn_server" class="regular-text" placeholder="https://api.digiwp.com/v1" value="<?php echo esc_attr( $conn['server_url'] ); ?>">
					<p class="description">Your server's API base — the only origin allowed to drive this site.</p>
				</td></tr>
				<tr><th scope="row">Shared secret</th><td>
					<input type="password" name="cb_conn_secret" class="regular-text" autocomplete="new-password" placeholder="<?php echo $conn['secret'] ? '•••••••• (saved — leave blank to keep)' : 'paste the secret generated by your hub'; ?>">
					<p class="description">Used to HMAC-sign every request. Generate it on your hub and paste it here once.</p>
				</td></tr>
				<tr><th scope="row">Site key</th><td>
					<code><?php echo esc_html( $conn['site_id'] ?: '— (created on save)' ); ?></code>
					<p class="description">Give this to your hub so it can address this site.</p>
				</td></tr>
				<tr><th scope="row">On save</th><td>
					<label><input type="checkbox" name="cb_conn_register" value="1"> Announce this site to the hub now (POST <code>/connector/register</code>)</label>
				</td></tr>
			</table>
			<?php submit_button( 'Save connector settings' ); ?>
		</form>

		<hr style="margin:28px 0">
		<h2 id="cb-activity">📓 Activity log <span style="font-size:12px;color:#888">— the last <?php echo (int) CB_ACTIVITY_MAX; ?> tool calls</span></h2>
		<?php
		$cb_last = cb_last_seen();
		$cb_log  = cb_activity_entries();
		?>
		<p>Last authorized call: <b><?php echo $cb_last ? esc_html( cb_time_ago( $cb_last ) . ' (' . wp_date( 'Y-m-d H:i', $cb_last ) . ')' ) : 'never'; ?></b>.</p>
		<?php if ( $cb_log ) : ?>
			<table class="widefat striped" style="max-width:820px">
				<thead><tr><th>When</th><th>Call</th><th>Result</th><th style="text-align:right">Took</th></tr></thead>
				<tbody>
				<?php foreach ( $cb_log as $cb_e ) : ?>
					<tr>
						<td style="white-space:nowrap"><?php echo esc_html( wp_date( 'Y-m-d H:i:s', $cb_e['t'] ) ); ?></td>
						<td><code style="font-size:12px"><?php echo esc_html( cb_activity_label( $cb_e ) ); ?></code></td>
						<td><?php echo empty( $cb_e['ok'] ) ? '<span style="color:#b32d2e">error</span>' : 'ok'; ?></td>
						<td style="text-align:right"><?php echo (int) $cb_e['ms']; ?> ms</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php else : ?>
			<p class="description">Nothing logged yet — the log fills up as Claude works on this site.</p>
		<?php endif; ?>
		<form method="post" style="margin-top:12px"><?php wp_nonce_field( 'cb_activity' ); ?>
			<input type="hidden" name="cb_activity_save" value="1">
			<p><label><input type="checkbox" name="cb_activity_on" value="1" <?php checked( cb_activity_enabled() ); ?>> Log tool calls (tool name, transport, result and duration — never arguments or content)</label></p>
			<p><label><input type="checkbox" name="cb_activity_clear" value="1"> Clear the log now</label></p>
			<?php submit_button( 'Save log settings', 'secondary' ); ?>
		</form>
	</div>
	<?php
}

/* ============================================================================
 * 9. ACTIVITY LOG
 * A tiny ring buffer of what the connected model actually did on this site,
 * so the dashboard widget can show "Connected · active 2 hours ago" and the
 * last few calls. Stored in one non-autoloaded option; never grows.
 * ========================================================================== */

/** Is call logging on? (Option, default on.) */
function cb_activity_enabled() {
	return get_option( CB_ACTIVITY_OPTION_ON, '1' ) === '1';
}

/** Get (or set) the transport the current call arrived on: rest | mcp. */
function cb_activity_channel( $set = null ) {
	static $channel = 'rest';
	if ( $set !== null ) {
		$channel = $set;
	}
	return $channel;
}

/** Record one tool call. Keeps the newest CB_ACTIVITY_MAX entries. */
function cb_activity_record( $tool, $ok, $ms ) {
	// "Last seen" only needs minute accuracy — don't write it on every call.
	$now = time();
	if ( $now - cb_last_seen() > MINUTE_IN_SECONDS ) {
		update_option( CB_LASTSEEN_OPTION, $now, false );
	}
	if ( ! cb_activity_enabled() ) {
		return;
	}
	$log = get_option( CB_ACTIVITY_OPTION, array() );
	if ( ! is_array( $log ) ) {
		$log = array();
	}
	array_unshift( $log, array(
		't'    => $now,
		'tool' => (string) $tool,
		'ch'   => cb_activity_channel(),
		'ok'   => $ok ? 1 : 0,
		'ms'   => (int) $ms,
	) );
	if ( count( $log ) > CB_ACTIVITY_MAX ) {
		$log = array_slice( $log, 0, CB_ACTIVITY_MAX );
	}
	update_option( CB_ACTIVITY_OPTION, $log, false );
}

/** Newest-first log entries. */
function cb_activity_entries( $limit = 0 ) {
	$log = get_option( CB_ACTIVITY_OPTION, array() );
	if ( ! is_array( $log ) ) {
		return array();
	}
	return $limit > 0 ? array_slice( $log, 0, $limit ) : $log;
}

function cb_activity_clear() {
	update_option( CB_ACTIVITY_OPTION, array(), false );
}

/** Unix time of the last authorized call, or 0 if this site was never driven. */
function cb_last_seen() {
	return (int) get_option( CB_LASTSEEN_OPTION, 0 );
}

/** Render one entry the way it looked on the wire. */
function cb_activity_label( $entry ) {
	$tool = isset( $entry['tool'] ) ? $entry['tool'] : '?';
	$ch   = isset( $entry['ch'] ) ? $entry['ch'] : 'rest';
	if ( $ch === 'mcp' ) {
		return 'MCP tools/call → ' . $tool;
	}
	return 'POST /claude-bridge/v1/tool/' . $tool;
}

/* ============================================================================
 * 10. COOKBOOK
 * A library of ready-to-paste prompts — "recipes" — for the things people
 * actually ask an AI to do on a WordPress site. Each recipe knows which
 * stack it needs (WooCommerce, Elementor, a block theme…), so the dashboard
 * widget can surface the ones that fit THIS site.
 * ========================================================================== */

/** What this site is built on — the keys recipes match against. */
function cb_site_stack() {
	static $stack = null;
	if ( $stack !== null ) {
		return $stack;
	}
	$active = (array) get_option( 'active_plugins', array() );
	if ( is_multisite() ) {
		$active = array_merge( $active, array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) );
	}
	$has = function ( $needles ) use ( $active ) {
		foreach ( (array) $needles as $n ) {
			foreach ( $active as $p ) {
				if ( strpos( $p, $n ) === 0 ) {
					return true;
				}
			}
		}
		return false;
	};

	$stack = array();
	if ( $has( 'woocommerce/' ) || class_exists( 'WooCommerce' ) ) {
		$stack[] = 'woocommerce';
	}
	if ( $has( array( 'elementor/', 'elementor-pro/' ) ) || did_action( 'elementor/loaded' ) ) {
		$stack[] = 'elementor';
	}
	if ( $has( array( 'seo-by-rank-math/', 'wordpress-seo/', 'all-in-one-seo-pack/', 'wp-seopress/' ) ) ) {
		$stack[] = 'seo';
	}
	if ( $has( array( 'advanced-custom-fields/', 'advanced-custom-fields-pro/', 'secure-custom-fields/' ) ) || class_exists( 'ACF' ) ) {
		$stack[] = 'acf';
	}
	if ( $has( array( 'contact-form-7/', 'wpforms-lite/', 'wpforms/', 'gravityforms/', 'fluentform/' ) ) ) {
		$stack[] = 'forms';
	}
	if ( $has( array( 'litespeed-cache/', 'wp-rocket/', 'w3-total-cache/', 'wp-super-cache/', 'wp-fastest-cache/' ) ) ) {
		$stack[] = 'cache';
	}
	if ( function_exists( 'wp_is_block_theme' ) && wp_is_block_theme() ) {
		$stack[] = 'block-theme';
	} else {
		$stack[] = 'classic-theme';
	}
	if ( is_multisite() ) {
		$stack[] = 'multisite';
	}
	return $stack;
}

/** Human labels for the stack keys, used on recipe cards. */
function cb_stack_labels() {
	return array(
		'woocommerce'   => 'WooCommerce',
		'elementor'     => 'Elementor',
		'seo'           => 'SEO plugin',
		'acf'           => 'ACF',
		'forms'         => 'Forms',
		'cache'         => 'Caching plugin',
		'block-theme'   => 'Block theme',
		'classic-theme' => 'Classic theme',
		'multisite'     => 'Multisite',
	);
}

/**
 * The cookbook itself.
 *
 * id       — stable slug, also the anchor on the cookbook page
 * title    — what the recipe does
 * tags     — browsing/filtering labels
 * requires — stack keys; the recipe is offered when the site has ANY of them.
 *            Empty means it fits every site.
 * time     — rough wall-clock estimate
 * summary  — one line, shown on the card
 * prompt   — the thing you paste into Claude; [brackets] are yours to fill in
 * tools    — bridge tools the model will reach for
 */
function cb_cookbook_recipes() {
	$r = array();

	/* ---- Security, health, troubleshooting ------------------------------ */

	$r[] = array(
		'id'       => 'security-audit',
		'title'    => 'Run a Security Audit and Fix What It Finds',
		'tags'     => array( 'Security', 'Code review' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'Review every custom theme and plugin file for the vulnerabilities that actually get sites hacked, then patch them one at a time.',
		'tools'    => array( 'list_wp_skills', 'get_wp_skill', 'list_plugins', 'list_files', 'read_file', 'edit_file' ),
		'prompt'   => 'Audit this WordPress site for security problems in the code we control.

1. Load the bundled wp-security-review skill (list_wp_skills, then get_wp_skill) and follow it.
2. Scope: the active theme plus these custom plugins: [plugin folder names, or "every plugin not from wordpress.org"]. Skip well-known third-party plugins.
3. Look for missing capability checks, missing nonces on form/AJAX/REST handlers, unescaped output, unsanitized input, direct SQL without $wpdb->prepare, unrestricted file uploads, and anything using eval/unserialize on user input.
4. Report findings first, ranked by how exploitable they are, with file:line and a one-line proof of how it would be abused. Do not change anything yet.
5. Then fix them one file at a time, showing me the diff before each edit, starting with the worst.

Do not touch wp-config.php or core files.',
	);

	$r[] = array(
		'id'       => 'white-screen',
		'title'    => 'Track Down the Plugin Breaking a Page',
		'tags'     => array( 'Troubleshooting', 'Plugins' ),
		'requires' => array(),
		'time'     => '5–15 min',
		'summary'  => 'A page is white, fatal, or "critical error". Bisect the active plugins automatically and name the culprit.',
		'tools'    => array( 'conflict_scan', 'render_page', 'site_info', 'read_file' ),
		'prompt'   => 'This page is broken: [full URL of the broken page]. It shows [white screen / "There has been a critical error" / wrong layout].

Use the conflict_scan tool on that URL to find which active plugin causes it. Skip these plugins so the shop keeps working during the scan: [comma-separated plugin files, or "none"]. Run it now — I understand each plugin is briefly off during its own test.

When you have the culprit: explain what it collides with, check the debug log if one is readable, and propose the smallest safe fix (a snippet, a version pin, or a replacement plugin). Ask me before deactivating anything permanently.',
	);

	$r[] = array(
		'id'       => 'speed-audit',
		'title'    => 'Find What Is Actually Making This Site Slow',
		'tags'     => array( 'Performance' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'Hunt down slow queries, uncached loops, autoloaded option bloat and render-blocking assets — then fix the top offenders.',
		'tools'    => array( 'get_wp_skill', 'db_query', 'read_file', 'edit_file', 'render_page', 'flush_cache' ),
		'prompt'   => 'Find out why [page URL, e.g. the shop or homepage] is slow, and fix the top three causes.

1. Load the bundled wp-performance-review skill and follow it.
2. Check the size of autoloaded options with db_query (sum of option data where autoload = yes, plus the ten biggest rows) and tell me what is bloating it.
3. Read the active theme and our custom plugins for the classic offenders: queries inside loops, posts_per_page => -1, meta_query without an index, uncached remote requests, get_option in a loop, missing transients.
4. Render the page and list render-blocking scripts and styles that are loaded site-wide but only used on one template.
5. Report findings ranked by expected impact, then fix the top three, showing me each diff first. Flush caches when done.',
	);

	$r[] = array(
		'id'       => 'plugin-bloat',
		'title'    => 'Audit Plugin Bloat and Retire the Dead Weight',
		'tags'     => array( 'Maintenance', 'Plugins' ),
		'requires' => array(),
		'time'     => '15–30 min',
		'summary'  => 'Inventory every plugin, flag the abandoned and the redundant, and lay out a safe removal order.',
		'tools'    => array( 'list_plugins', 'site_info', 'db_query', 'set_plugin_state' ),
		'prompt'   => 'Give me an honest inventory of the plugins on this site.

List every installed plugin with version and active state. For each one tell me: what it does here, whether anything on the site still uses it, whether two plugins overlap (two SEO plugins, three caching plugins, four form plugins), and which look abandoned or superseded by core.

Then give me a removal plan in a safe order — deactivate first, what to watch after each removal, and what data each one leaves behind in the database. Do not deactivate or delete anything until I confirm the list.',
	);

	$r[] = array(
		'id'       => 'user-audit',
		'title'    => 'Audit Users, Roles and Admin Access',
		'tags'     => array( 'Security', 'Users' ),
		'requires' => array(),
		'time'     => '10–20 min',
		'summary'  => 'Find stale administrators, unexpected role grants and accounts nobody remembers creating.',
		'tools'    => array( 'list_users', 'get_users', 'db_query', 'update_users' ),
		'prompt'   => 'Audit who can get into this site.

List every user with the administrator or editor role, when they last posted, and their registration date. Use db_query to check usermeta for capability grants that do not match a normal role, and flag any account whose email domain is not [our domain].

Give me a table of "keep / downgrade / remove", with a reason per row. Do not change any account until I approve the table — then apply exactly what I approve.',
	);

	$r[] = array(
		'id'       => 'health-report',
		'title'    => 'Weekly Site Health Report',
		'tags'     => array( 'Reporting', 'Maintenance' ),
		'requires' => array(),
		'time'     => '5–10 min',
		'summary'  => 'One readable status page: versions, content counts, pending updates, database weight and anything that changed.',
		'tools'    => array( 'site_info', 'count_posts', 'count_terms', 'list_plugins', 'db_query', 'list_comments' ),
		'prompt'   => 'Write me a site health report for this WordPress install, in plain language, as a short markdown document.

Cover: WordPress and PHP versions, active theme, how many plugins are active vs installed and which are outdated, content counts by post type and status, pending comments and spam, the ten largest database tables, total autoloaded option size, and the last few things changed on the site.

End with a "what I would do this week" section: at most five concrete items, ordered by value. No filler.',
	);

	/* ---- Building things ------------------------------------------------- */

	$r[] = array(
		'id'       => 'build-plugin',
		'title'    => 'Turn a Plain-English Spec into a Real Plugin',
		'tags'     => array( 'Development', 'Plugins' ),
		'requires' => array(),
		'time'     => '30–60 min',
		'summary'  => 'Describe the behaviour you want; get a properly structured, escaped, nonce-checked plugin scaffolded and activated on the site.',
		'tools'    => array( 'get_wp_skill', 'create_plugin', 'write_file', 'edit_file', 'set_plugin_state' ),
		'prompt'   => 'Build me a small WordPress plugin on this site.

What it should do: [describe the behaviour in plain language — e.g. "add a Delivery Date field to the checkout, store it on the order, show it in the admin order screen and in the order confirmation email"].

Rules:
- Load the bundled wp-plugin-development skill first and follow its structure and naming conventions.
- Prefix everything with [your prefix], text domain [your-text-domain].
- Escape all output, sanitize all input, check capabilities and nonces on every write path.
- Scaffold with create_plugin, then write the real files. Show me the plan and the file list before you write code.
- Activate it when it is done and tell me exactly how to test it.',
	);

	$r[] = array(
		'id'       => 'rest-endpoint',
		'title'    => 'Add a Custom REST Endpoint the Right Way',
		'tags'     => array( 'Development', 'REST API' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'A registered route with a real permission callback, an argument schema, and a response shape that will not drift.',
		'tools'    => array( 'get_wp_skill', 'write_file', 'edit_file', 'wp_rest' ),
		'prompt'   => 'Add a REST endpoint to this site.

Route: [namespace/v1/thing]. It should [what it returns or accepts]. Who may call it: [logged-out / logged-in / a specific capability].

Load the bundled wp-rest-api-development skill first and follow it. I want a real permission_callback (never __return_true unless the data is genuinely public and you say so out loud), an args schema with sanitize and validate callbacks, and a documented response shape.

Put it in [existing plugin folder, or scaffold a new one]. When it is live, call it through the bridge and show me the actual response.',
	);

	$r[] = array(
		'id'       => 'child-theme',
		'title'    => 'Restyle the Site Safely with a Child Theme',
		'tags'     => array( 'Theme', 'Design' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'Move custom CSS and template overrides out of the parent theme so the next update stops eating your work.',
		'tools'    => array( 'list_themes', 'list_files', 'read_file', 'write_file', 'preview_url', 'activate_theme' ),
		'prompt'   => 'Set up a proper child theme for the active theme on this site, then move my customizations into it.

1. Create the child theme (style.css header, functions.php enqueueing the parent stylesheet correctly, screenshot optional).
2. Find customizations that currently live in the parent theme or in Additional CSS and move them across, template overrides included.
3. Then make this design change: [describe the change — colors, spacing, header layout, fonts].
4. Give me a preview URL of the child theme before activating anything. I will tell you when to activate.',
	);

	$r[] = array(
		'id'       => 'preview-before-publish',
		'title'    => 'Redesign a Theme and Preview It Before Publishing',
		'tags'     => array( 'Theme', 'Design' ),
		'requires' => array(),
		'time'     => '30–60 min',
		'summary'  => 'Work on an inactive theme, look at it through a tokened preview URL, and only publish when it is right.',
		'tools'    => array( 'list_themes', 'read_file', 'write_file', 'edit_file', 'preview_url', 'render_page', 'activate_theme' ),
		'prompt'   => 'Redesign [theme slug] without touching the live site.

The theme is installed but not active. Work directly in its files, then give me a preview_url so I can see it while visitors still get the current design.

The brief: [what should change — "make it feel like [reference site]", brand colors [hex codes], the header should [ … ]].

Iterate with me on the preview. Render the page yourself between changes to check you did not break the layout. Only activate the theme when I say so.',
	);

	$r[] = array(
		'id'       => 'landing-page',
		'title'    => 'Build a Landing Page from a Brief',
		'tags'     => array( 'Content', 'Design' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'One paragraph of intent in, a complete published page with real sections and internal links out.',
		'tools'    => array( 'create_pages', 'update_pages', 'list_pages', 'upload_media_from_url', 'render_page' ),
		'prompt'   => 'Build a landing page on this site.

Goal: [what the page must get people to do]. Audience: [who they are]. Offer: [what we are selling or giving away]. Tone: [how it should read].

Structure it as hero, problem, solution, proof, objections, call to action — adapt if something else fits better and tell me why. Match the existing site voice: read two or three published pages first.

Create it as a draft at [/slug], link it from [where], and give me the preview link. Do not publish until I approve.',
	);

	$r[] = array(
		'id'       => 'navigation-rebuild',
		'title'    => 'Rebuild the Site Navigation',
		'tags'     => array( 'Content', 'UX' ),
		'requires' => array(),
		'time'     => '15–30 min',
		'summary'  => 'Audit the menus against what the site actually contains, then rebuild them so people can find things.',
		'tools'    => array( 'list_menus', 'list_menu_items', 'create_menu_items', 'update_menu_items', 'delete_menu_items', 'list_pages' ),
		'prompt'   => 'Fix this site\'s navigation.

List every menu and every menu item, and cross-check against the published pages and post types. Tell me which items point at missing or redirected pages, which important pages are unreachable from the menu, and where the hierarchy is confusing.

Then propose a new structure for [menu name] — maximum [number] top-level items — and once I approve it, build it. Keep the old menu intact until the new one is live.',
	);

	/* ---- Content, media, SEO --------------------------------------------- */

	$r[] = array(
		'id'       => 'alt-text-sweep',
		'title'    => 'Fill In Every Missing Image Alt Text',
		'tags'     => array( 'Media', 'Accessibility', 'SEO' ),
		'requires' => array(),
		'time'     => '15–30 min',
		'summary'  => 'Find media items with no alt text, write descriptive alternatives that fit the page they are used on, and save them.',
		'tools'    => array( 'list_media', 'get_media', 'update_media', 'db_query', 'get_meta', 'update_meta' ),
		'prompt'   => 'Fix the missing image alt text on this site.

Find attachments with an empty _wp_attachment_image_alt. For each one, look at the filename, caption and the post it is attached to, then write an alt text that describes what is in the image for someone who cannot see it — not a keyword list, and no "image of".

Do the first ten, show me the before/after table, and wait for my go-ahead before doing the rest. Skip purely decorative images and tell me which ones you skipped.',
	);

	$r[] = array(
		'id'       => 'content-calendar',
		'title'    => 'Draft and Schedule a Month of Posts',
		'tags'     => array( 'Content' ),
		'requires' => array(),
		'time'     => '30–60 min',
		'summary'  => 'Turn a list of topics into scheduled drafts with categories, tags, excerpts and internal links already in place.',
		'tools'    => array( 'list_posts', 'create_posts', 'update_posts', 'list_categories', 'create_tags' ),
		'prompt'   => 'Plan and draft a month of posts for this site.

Topics: [list them, or say "propose them from what already ranks here"]. Publishing rhythm: [e.g. every Tuesday and Thursday at 09:00]. Length: [words]. Voice: read the five most recent published posts and match them.

For each post: a working title, an excerpt, the right existing category (do not invent new ones without asking), tags, and two or three internal links to relevant existing posts. Create them as scheduled drafts. Give me the calendar as a table when you are done.',
	);

	$r[] = array(
		'id'       => 'bulk-find-replace',
		'title'    => 'Bulk Find-and-Replace Across Posts and Pages',
		'tags'     => array( 'Content', 'Maintenance' ),
		'requires' => array(),
		'time'     => '10–20 min',
		'summary'  => 'Change a name, a URL or a phone number everywhere it appears — with a dry run first and revisions to fall back on.',
		'tools'    => array( 'search', 'db_query', 'get_posts', 'update_posts', 'list_revisions', 'restore_revision' ),
		'prompt'   => 'Replace [old text] with [new text] across this site\'s content.

First, a dry run: use search and db_query to show me every post, page and custom post type item that contains it, with the surrounding sentence, and count them. Include post content, excerpts and titles. Flag anything inside a shortcode, a block attribute or a URL, because those need care.

After I approve the list, apply the change post by post so WordPress records a revision each time, and give me the list of edited IDs so we can roll back.',
	);

	$r[] = array(
		'id'       => 'media-cleanup',
		'title'    => 'Spring-Clean the Media Library',
		'tags'     => array( 'Media', 'Performance' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'Find oversized, duplicated and completely unused uploads, and get the disk back without breaking a page.',
		'tools'    => array( 'list_media', 'db_query', 'delete_media', 'get_posts' ),
		'prompt'   => 'Clean up the media library on this site.

Report, do not delete yet: the 30 largest files with their dimensions, images wider than 2500px that are only ever displayed small, obvious duplicates (same name with -1, -2 suffixes), and attachments that no post, page, meta field or theme option references.

For the unused list, be conservative and say how you checked. Then propose what to delete and what to regenerate at a sane size. I will approve in batches.',
	);

	$r[] = array(
		'id'       => 'broken-links',
		'title'    => 'Find Broken Links and Fix the 404s',
		'tags'     => array( 'SEO', 'Maintenance' ),
		'requires' => array(),
		'time'     => '20–40 min',
		'summary'  => 'Crawl your own content for dead internal links, missing images and old URLs, then repair or redirect them.',
		'tools'    => array( 'db_query', 'search', 'get_posts', 'update_posts', 'render_page', 'preview_url' ),
		'prompt'   => 'Find and fix broken links on this site.

Pull every internal link and image URL out of published content, check which ones resolve, and give me a table of broken targets with the posts that link to them.

For each broken link, propose the fix: the correct current URL, a redirect, or removal. Apply the ones I approve, editing the content directly. List anything that needs a redirect rule I have to add at the server or plugin level.',
	);

	$r[] = array(
		'id'       => 'accessibility-pass',
		'title'    => 'Accessibility Pass on the Templates People Actually Use',
		'tags'     => array( 'Accessibility', 'Theme' ),
		'requires' => array(),
		'time'     => '30–60 min',
		'summary'  => 'Keyboard traps, unlabelled controls, heading order and focus states — reviewed in the markup and fixed at the source.',
		'tools'    => array( 'get_wp_skill', 'render_page', 'read_file', 'edit_file' ),
		'prompt'   => 'Do an accessibility pass on this site.

Load the bundled wp-accessibility-review skill and follow it. Templates to review: [homepage, single post, the main archive, checkout — adjust to this site].

Render each one and check the real markup: heading order, landmarks, form labels, alt text, focus styles, keyboard operability of menus and modals, ARIA that contradicts the element it sits on, and controls that are only reachable with a mouse.

Report issues grouped by template with the offending markup, then fix them in the theme files, showing me each diff. Do not add an accessibility overlay.',
	);

	/* ---- Stack-specific: block themes ------------------------------------ */

	$r[] = array(
		'id'       => 'theme-json-rebrand',
		'title'    => 'Rebrand the Whole Site from theme.json',
		'tags'     => array( 'Block theme', 'Design' ),
		'requires' => array( 'block-theme' ),
		'time'     => '20–40 min',
		'summary'  => 'Set real design tokens once — palette, type scale, spacing — instead of sprinkling CSS overrides everywhere.',
		'tools'    => array( 'get_wp_skill', 'read_file', 'write_file', 'edit_file', 'render_page' ),
		'prompt'   => 'Rebrand this block theme through theme.json instead of custom CSS.

Brand colors: [hex codes and what each is for]. Heading font: [font]. Body font: [font]. Feel: [tight and technical / soft and editorial / …].

Load the bundled wp-theme-development skill first. Read the current theme.json, then set the palette, gradients, font families and sizes, and spacing scale as proper presets. Replace hardcoded colors and font sizes in templates and CSS with the presets you just defined.

Work in a child theme if the active theme is from wordpress.org. Render the homepage and a single post before and after, and tell me what still needs manual attention.',
	);

	$r[] = array(
		'id'       => 'reusable-pattern',
		'title'    => 'Turn a Page Section into a Reusable Pattern',
		'tags'     => array( 'Block theme', 'Content' ),
		'requires' => array( 'block-theme' ),
		'time'     => '15–30 min',
		'summary'  => 'Stop rebuilding the same call-to-action by hand: register it as a real pattern editors can drop in.',
		'tools'    => array( 'get_pages', 'get_posts', 'write_file', 'list_blocks', 'create_blocks' ),
		'prompt'   => 'Turn the [name the section — e.g. "book a call" band at the bottom of the services page] into a reusable block pattern.

Read the block markup from [page URL or ID], clean it up (no leftover inline styles, use theme.json presets, keep it responsive), and register it as a pattern in the active theme with a sensible title, category and keywords.

Then show me which existing pages contain a hand-built copy of that section, so I can decide whether to swap them over.',
	);

	/* ---- Stack-specific: classic themes ---------------------------------- */

	$r[] = array(
		'id'       => 'classic-to-block',
		'title'    => 'Plan the Move from a Classic Theme to a Block Theme',
		'tags'     => array( 'Theme', 'Migration' ),
		'requires' => array( 'classic-theme' ),
		'time'     => '30–60 min',
		'summary'  => 'An honest inventory of what a full-site-editing migration would cost here, before anyone commits to it.',
		'tools'    => array( 'get_wp_skill', 'list_themes', 'list_files', 'read_file', 'site_info' ),
		'prompt'   => 'Tell me what it would really take to move this site from its classic theme to a block theme.

Load the bundled wp-theme-development skill. Then inventory the active theme: template files and what each does, custom template tags, widget areas, menus, customizer settings, shortcodes, custom post types tied to templates, and anything that depends on the loop being classic.

Give me a migration plan in phases with an effort estimate per phase, what breaks if we do nothing, and what could move to a hybrid setup first. Be blunt about the parts that are not worth migrating. Do not change anything yet.',
	);

	/* ---- Stack-specific: WooCommerce ------------------------------------- */

	$r[] = array(
		'id'       => 'woo-noindex-categories',
		'title'    => 'Bulk Noindex WooCommerce Product Categories',
		'tags'     => array( 'WooCommerce', 'SEO' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '10–20 min',
		'summary'  => 'Thin and duplicate category archives quietly eat your crawl budget. Mark the right ones noindex in one pass.',
		'tools'    => array( 'list_product_categories', 'get_meta', 'update_meta', 'db_query', 'count_terms' ),
		'prompt'   => 'Set the right WooCommerce product categories to noindex.

List every product category with its product count, whether it has a description, and its current index setting from the SEO plugin\'s term meta. Recommend noindex for: categories with fewer than [number] products, categories with no description, and [any other rule you want].

Show me the table with your recommendation per category first. After I approve, write the noindex term meta for exactly the approved ones and confirm what changed. Do not touch categories that receive traffic — flag those instead.',
	);

	$r[] = array(
		'id'       => 'woo-low-stock',
		'title'    => 'Low-Stock Report and Restock Plan',
		'tags'     => array( 'WooCommerce', 'Reporting' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '10–20 min',
		'summary'  => 'What is nearly out, what sells fastest, and what to order first — from the real order data.',
		'tools'    => array( 'list_products', 'get_products', 'list_orders', 'db_query', 'update_products' ),
		'prompt'   => 'Give me a restock plan for this shop.

List products at or below their low-stock threshold, and for each one work out how many units sold in the last [30/60/90] days from completed orders, so I can see how long the remaining stock lasts.

Sort by urgency (days of cover remaining, revenue at risk). Include out-of-stock products that still get orders attempted. Present it as a table I can hand to a supplier. Do not change any stock levels.',
	);

	$r[] = array(
		'id'       => 'woo-sale',
		'title'    => 'Launch a Seasonal Sale: Coupons and Scheduled Prices',
		'tags'     => array( 'WooCommerce', 'Marketing' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '20–40 min',
		'summary'  => 'Set sale prices with real start and end dates, generate the coupons, and check nothing sells below cost.',
		'tools'    => array( 'list_products', 'update_products', 'create_coupons', 'list_coupons', 'create_pages' ),
		'prompt'   => 'Set up a [occasion] sale on this shop.

Scope: [which categories or products]. Discount: [percentage or amount]. Runs from [date] to [date].

1. Show me the affected products with current price, proposed sale price, and margin if cost data exists. Flag anything that would sell at a loss.
2. After I approve, set scheduled sale prices with the exact start and end dates so they expire on their own.
3. Create a coupon: code [CODE], [restrictions — minimum spend, one per customer, excluded categories].
4. Draft a sale landing page listing the discounted products, and tell me what to check on the day the sale ends.',
	);

	$r[] = array(
		'id'       => 'woo-failed-orders',
		'title'    => 'Investigate Failed and Stuck Orders',
		'tags'     => array( 'WooCommerce', 'Troubleshooting' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '15–30 min',
		'summary'  => 'Money that never arrived: group the failures by cause, and separate the payment problems from the site problems.',
		'tools'    => array( 'list_orders', 'get_orders', 'db_query', 'get_meta', 'render_page' ),
		'prompt'   => 'Work out why orders are failing on this shop.

Pull orders with status failed, pending or on-hold from the last [30] days. Group them by payment method, error note, product, country and total value, and tell me which pattern accounts for most of the lost revenue.

Separate gateway declines (the customer\'s bank) from site-side failures (fatal errors, timeouts, a plugin conflict at checkout). For the site-side ones, dig into the order notes and reproduce what you can. Give me the top three causes and the fix for each.',
	);

	$r[] = array(
		'id'       => 'woo-product-copy',
		'title'    => 'Rewrite Thin Product Descriptions',
		'tags'     => array( 'WooCommerce', 'Content', 'SEO' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '30–60 min',
		'summary'  => 'Find products with copy pasted from the manufacturer or no copy at all, and give them something worth reading.',
		'tools'    => array( 'list_products', 'get_products', 'update_products', 'db_query' ),
		'prompt'   => 'Improve the product copy in this shop.

Find products whose description is empty, under [80] words, or identical to another product\'s. Start with the [20] that sell best.

For each: a short description that leads with the benefit and the one fact that decides the purchase, and a long description covering what it is, who it is for, specifications, and what is in the box. Keep our voice — read three of the best existing descriptions first. Never invent specifications; if you need a fact I have not given you, leave a clearly marked [TO CONFIRM].

Show me the first five before continuing, then update the products.',
	);

	$r[] = array(
		'id'       => 'woo-checkout-review',
		'title'    => 'Review a Customized Checkout Before It Costs You Sales',
		'tags'     => array( 'WooCommerce', 'Code review' ),
		'requires' => array( 'woocommerce' ),
		'time'     => '30–60 min',
		'summary'  => 'Custom checkout code is where HPOS breakage, security holes and silent order failures hide.',
		'tools'    => array( 'get_wp_skill', 'list_plugins', 'list_files', 'read_file', 'edit_file' ),
		'prompt'   => 'Review every customization we have made to the WooCommerce checkout and cart.

Load the bundled wp-woocommerce-dev skill and follow it. Look in the active theme (including any woocommerce/ template overrides) and in our custom plugins.

I want to know: which template overrides are outdated compared to the plugin\'s current versions, any direct post-meta access that breaks under HPOS, missing nonce or capability checks on checkout hooks, anything doing remote requests during checkout, and cart fragment abuse.

Report first, with file:line and impact. Then fix in order of risk, one diff at a time.',
	);

	/* ---- Stack-specific: Elementor --------------------------------------- */

	$r[] = array(
		'id'       => 'elementor-header-footer',
		'title'    => 'Create a Global Elementor Header and Footer',
		'tags'     => array( 'Elementor', 'Design' ),
		'requires' => array( 'elementor' ),
		'time'     => '20–40 min',
		'summary'  => 'One header and one footer applied everywhere, instead of a slightly different copy on each page.',
		'tools'    => array( 'list_templates', 'get_templates', 'create_templates', 'list_pages', 'update_pages', 'render_page' ),
		'prompt'   => 'Build a global header and footer for this Elementor site.

First tell me what exists today: theme header/footer, Elementor templates, and any per-page overrides that would fight a global one.

Header should contain: [logo, menu, phone number, call-to-action button — adjust]. Footer should contain: [columns, links, contact details, copyright].

Build them as templates applied site-wide, match the existing brand colors and fonts (read them from the site, do not guess), and make sure they work on mobile. Then list the pages that still carry their own copy so I can clear them out.',
	);

	$r[] = array(
		'id'       => 'elementor-slim-down',
		'title'    => 'Slim Down a Bloated Elementor Page',
		'tags'     => array( 'Elementor', 'Performance' ),
		'requires' => array( 'elementor' ),
		'time'     => '20–40 min',
		'summary'  => 'Nested sections, unused widgets and five font weights: find the weight and take it out without changing the design.',
		'tools'    => array( 'get_pages', 'db_query', 'render_page', 'list_plugins', 'flush_cache' ),
		'prompt'   => 'Make [page URL] lighter without changing how it looks.

Render it and analyze what is actually loaded: Elementor widget CSS and JS files, Google Fonts and their weights, icon libraries, images served far larger than displayed, and third-party embeds.

Read the page\'s Elementor data and tell me about deeply nested sections, empty containers, widgets that are hidden on every breakpoint, and animations nobody sees. Give me a ranked list of what to remove or replace with the expected saving, then apply the ones I approve and flush the cache.',
	);

	/* ---- Stack-specific: SEO plugin, ACF, forms, multisite --------------- */

	$r[] = array(
		'id'       => 'seo-meta-sweep',
		'title'    => 'Fix Missing SEO Titles and Meta Descriptions',
		'tags'     => array( 'SEO', 'Content' ),
		'requires' => array( 'seo' ),
		'time'     => '20–40 min',
		'summary'  => 'Every page that leaves it to the plugin default gets a written title and description that matches its content.',
		'tools'    => array( 'db_query', 'list_posts', 'list_pages', 'get_meta', 'update_meta' ),
		'prompt'   => 'Fill in the missing SEO titles and meta descriptions on this site.

Find published posts, pages and product pages with no custom SEO title or description in the SEO plugin\'s meta (check what this site actually uses first). Start with the [30] that get the most internal links.

Write a title under 60 characters and a description between 140 and 160 that reflects what is really on the page — read the content, do not pattern-match the title. No clickbait, no keyword stuffing.

Show me the first ten as a table, then write the rest after I approve the style.',
	);

	$r[] = array(
		'id'       => 'acf-content-model',
		'title'    => 'Model a New Content Type with ACF',
		'tags'     => array( 'ACF', 'Development' ),
		'requires' => array( 'acf' ),
		'time'     => '30–60 min',
		'summary'  => 'Design the fields before building the templates, and keep the definitions in version control where they belong.',
		'tools'    => array( 'get_wp_skill', 'list_post_types', 'write_file', 'read_file', 'list_files' ),
		'prompt'   => 'Design and build a content type on this site: [e.g. "case studies", "team members", "properties"].

Load the bundled wp-acf-and-content-modeling skill and follow it. Look at how existing post types and field groups are defined here and stay consistent.

Give me the model first: post type, taxonomies, every field with its type, name, and why it exists — plus what should NOT be a field. Point out anything that will be slow to query later.

After I approve the model: register the post type in a plugin (not the theme), create the field group, save it as ACF JSON in the repo, and build the template that renders it.',
	);

	$r[] = array(
		'id'       => 'forms-review',
		'title'    => 'Audit the Forms People Actually Submit',
		'tags'     => array( 'Forms', 'Security' ),
		'requires' => array( 'forms' ),
		'time'     => '15–30 min',
		'summary'  => 'Check that submissions arrive, that notifications work, and that the form is not leaking or storing what it should not.',
		'tools'    => array( 'list_plugins', 'db_query', 'get_posts', 'render_page', 'get_settings' ),
		'prompt'   => 'Audit the forms on this site.

List every form, where it is embedded, where its submissions go (email, database, external service), and when it last received one. Flag forms with no recent submissions — they are usually broken, not unpopular.

Check the notification addresses still exist, whether the site can send mail at all, whether spam protection is active, and whether any form stores personal data it does not need or exposes entries to the wrong role.

Give me the problems with a fix for each, worst first.',
	);

	$r[] = array(
		'id'       => 'multisite-plugin-audit',
		'title'    => 'Network-Wide Plugin and Theme Audit',
		'tags'     => array( 'Multisite', 'Maintenance' ),
		'requires' => array( 'multisite' ),
		'time'     => '20–40 min',
		'summary'  => 'See what every site in the network is running, and where the versions have drifted apart.',
		'tools'    => array( 'list_plugins', 'list_themes', 'db_query', 'site_info' ),
		'prompt'   => 'Audit this multisite network.

For every site: active theme, active plugins, WordPress version state, and anything network-activated but disabled locally. Show me where the drift is — plugins active on some sites and not others, themes nobody uses, sites left on abandoned plugins.

Then recommend what to network-activate, what to remove, and what needs a per-site decision. Be explicit about which changes touch every site at once. Change nothing until I approve.',
	);

	/* ---- Working with the bridge itself ---------------------------------- */

	$r[] = array(
		'id'       => 'onboard-site',
		'title'    => 'Onboard: Tell Me What This Site Even Is',
		'tags'     => array( 'Onboarding', 'Reporting' ),
		'requires' => array(),
		'time'     => '10–20 min',
		'summary'  => 'You just inherited a WordPress site. Get an orientation before you touch anything.',
		'tools'    => array( 'get_wp_skill', 'site_info', 'list_plugins', 'list_themes', 'list_files', 'count_posts', 'db_query' ),
		'prompt'   => 'I just inherited this WordPress site and know nothing about it. Orient me.

Load the bundled wp-site-audit-and-onboarding skill and follow it.

Tell me: what the site is for, what stack it runs (page builder, shop, headless, multisite, custom plugins), which code is custom and therefore ours to maintain, where the customizations live, what looks abandoned, and what would scare you if you had to deploy a change tomorrow.

Finish with the three things I should look at first, and which of this cookbook\'s recipes fit this site.',
	);

	return $r;
}

/** One recipe by id, or null. */
function cb_cookbook_recipe( $id ) {
	foreach ( cb_cookbook_recipes() as $r ) {
		if ( $r['id'] === $id ) {
			return $r;
		}
	}
	return null;
}

/** Every tag in the cookbook, sorted, for the filter bar. */
function cb_cookbook_tags() {
	$tags = array();
	foreach ( cb_cookbook_recipes() as $r ) {
		foreach ( $r['tags'] as $t ) {
			$tags[ $t ] = isset( $tags[ $t ] ) ? $tags[ $t ] + 1 : 1;
		}
	}
	ksort( $tags );
	return $tags;
}

/** Does this recipe fit this site? (No requirements = fits everything.) */
function cb_recipe_fits( $recipe, $stack = null ) {
	if ( empty( $recipe['requires'] ) ) {
		return true;
	}
	$stack = $stack === null ? cb_site_stack() : $stack;
	return (bool) array_intersect( (array) $recipe['requires'], $stack );
}

/**
 * The recipes to show on the dashboard: ones that need something this site
 * actually has come first, then the universal ones. Rotates daily so the
 * widget is not the same three cards forever.
 */
function cb_cookbook_picks( $count = 3 ) {
	$stack    = cb_site_stack();
	$specific = array();
	$general  = array();
	foreach ( cb_cookbook_recipes() as $r ) {
		if ( ! cb_recipe_fits( $r, $stack ) ) {
			continue;
		}
		if ( empty( $r['requires'] ) ) {
			$general[] = $r;
		} else {
			$specific[] = $r;
		}
	}
	// Deterministic per site per day — no randomness, so the widget is stable
	// while you read it but different tomorrow.
	$seed = abs( (int) floor( time() / DAY_IN_SECONDS ) + (int) sprintf( '%u', crc32( home_url() ) ) );
	$rot  = function ( $list ) use ( $seed ) {
		$n = count( $list );
		if ( $n < 2 ) {
			return $list;
		}
		$k = $seed % $n;
		return array_merge( array_slice( $list, $k ), array_slice( $list, 0, $k ) );
	};
	$picks = array_merge( $rot( $specific ), $rot( $general ) );
	return array_slice( $picks, 0, $count );
}

/** Admin URL of the cookbook page, optionally anchored on one recipe. */
function cb_cookbook_url( $recipe_id = '' ) {
	$url = admin_url( 'tools.php?page=claude-bridge-cookbook' );
	if ( $recipe_id !== '' ) {
		$url = add_query_arg( 'recipe', $recipe_id, $url ) . '#recipe-' . $recipe_id;
	}
	return $url;
}

/** What lands on the clipboard: the prompt plus a link back to the recipe. */
function cb_recipe_clipboard( $recipe ) {
	return $recipe['prompt'] . "\n\n— " . $recipe['title'] . ': ' . cb_cookbook_url( $recipe['id'] );
}

/** Tool op: list cookbook recipes (optionally filtered). */
function cb_op_list_recipes( $args ) {
	$tag   = isset( $args['tag'] ) ? strtolower( (string) $args['tag'] ) : '';
	$q     = isset( $args['search'] ) ? strtolower( (string) $args['search'] ) : '';
	$mine  = ! empty( $args['for_this_site'] );
	$stack = cb_site_stack();
	$out   = array();
	foreach ( cb_cookbook_recipes() as $r ) {
		if ( $mine && ! cb_recipe_fits( $r, $stack ) ) {
			continue;
		}
		if ( $tag !== '' ) {
			$hit = false;
			foreach ( $r['tags'] as $t ) {
				if ( strtolower( $t ) === $tag ) {
					$hit = true;
				}
			}
			if ( ! $hit ) {
				continue;
			}
		}
		if ( $q !== '' && strpos( strtolower( $r['title'] . ' ' . $r['summary'] . ' ' . implode( ' ', $r['tags'] ) ), $q ) === false ) {
			continue;
		}
		$out[] = array(
			'id'        => $r['id'],
			'title'     => $r['title'],
			'tags'      => $r['tags'],
			'requires'  => $r['requires'],
			'time'      => $r['time'],
			'summary'   => $r['summary'],
			'fits_site' => cb_recipe_fits( $r, $stack ),
		);
	}
	return array(
		'count'   => count( $out ),
		'stack'   => $stack,
		'usage'   => 'Call get_recipe with {"id":"<id>"} for the full prompt and the tools it uses.',
		'recipes' => $out,
	);
}

/** Tool op: one recipe, in full. */
function cb_op_get_recipe( $args ) {
	$id = isset( $args['id'] ) ? (string) $args['id'] : '';
	$r  = cb_cookbook_recipe( $id );
	if ( ! $r ) {
		return new WP_Error( 'cb_no_recipe', 'Unknown recipe id: ' . $id . '. Call list_recipes for valid ids.' );
	}
	$r['fits_site'] = cb_recipe_fits( $r );
	$r['url']       = cb_cookbook_url( $r['id'] );
	return $r;
}

/* ============================================================================
 * 11. COOKBOOK IN WP-ADMIN  (dashboard widget + full recipe browser)
 * ========================================================================== */

add_action( 'admin_menu', function () {
	add_management_page( 'Claude Cookbook', 'Claude Cookbook', 'manage_options', 'claude-bridge-cookbook', 'cb_cookbook_page' );
} );

add_action( 'wp_dashboard_setup', function () {
	if ( current_user_can( 'manage_options' ) ) {
		wp_add_dashboard_widget( 'cb_dashboard_widget', 'Claude Bridge', 'cb_dashboard_widget' );
	}
} );

/** Shared styles for the widget and the cookbook page. Printed once. */
function cb_print_ui_css() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;
	?>
	<style>
	.cb-ui-hd{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#646970;margin:14px 0 6px}
	.cb-ui-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #f0f0f1}
	.cb-ui-row:first-of-type{border-top:0}
	.cb-ui-grow{flex:1;min-width:0}
	.cb-ui-mono{font-family:Consolas,Monaco,monospace;font-size:12px;color:#1d2327;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.cb-ui-when{color:#787c82;font-size:12px;white-space:nowrap}
	.cb-ui-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#00a32a;margin-right:7px;vertical-align:middle}
	.cb-ui-dot.cb-idle{background:#dba617}
	.cb-ui-dot.cb-off{background:#c3c4c7}
	.cb-ui-chip{display:inline-block;padding:1px 9px;border:1px solid #dcdcde;border-radius:999px;font-size:11px;line-height:18px;color:#50575e;background:#fff;white-space:nowrap}
	.cb-ui-chip.cb-fit{border-color:#a7d5b0;background:#f2fbf4;color:#1f6f39}
	.cb-ui-note{color:#787c82;font-size:12px;margin:10px 0 4px}
	.cb-ui-foot{margin-top:12px;padding-top:10px;border-top:1px solid #f0f0f1;font-size:12px}
	.cb-ui-fail{color:#b32d2e}
	.cb-card{background:#fff;border:1px solid #dcdcde;border-radius:6px;padding:16px 18px;margin:0 0 14px}
	.cb-card h2{margin:0 0 4px;font-size:15px}
	.cb-card .cb-meta{color:#787c82;font-size:12px;margin:0 0 8px}
	.cb-card .cb-sum{margin:0 0 10px;color:#3c434a}
	.cb-card pre{background:#f6f7f7;border:1px solid #e0e0e0;border-radius:4px;padding:12px;margin:8px 0 0;white-space:pre-wrap;font-size:12.5px;line-height:1.55;max-height:420px;overflow:auto}
	.cb-card summary{cursor:pointer;color:#2271b1;font-size:13px}
	.cb-filters{margin:12px 0 18px}
	.cb-filters a{display:inline-block;margin:0 6px 6px 0;padding:3px 11px;border:1px solid #dcdcde;border-radius:999px;background:#fff;text-decoration:none;font-size:12px;color:#50575e}
	.cb-filters a.cb-on{background:#2271b1;border-color:#2271b1;color:#fff}
	.cb-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px}
	@media (max-width:782px){.cb-cols{grid-template-columns:1fr}}
	</style>
	<?php
}

/** Clipboard helper used by every "Copy prompt" button. Printed once. */
function cb_print_copy_js() {
	static $done = false;
	if ( $done ) {
		return;
	}
	$done = true;
	?>
	<script>
	(function(){
		function flash(btn){
			var old = btn.getAttribute('data-cb-label') || btn.textContent;
			btn.setAttribute('data-cb-label', old);
			btn.textContent = 'Copied ✓';
			setTimeout(function(){ btn.textContent = old; }, 1800);
		}
		document.addEventListener('click', function(e){
			var btn = e.target.closest ? e.target.closest('[data-cb-copy]') : null;
			if (!btn) { return; }
			e.preventDefault();
			var src = document.getElementById(btn.getAttribute('data-cb-copy'));
			if (!src) { return; }
			var text = ('value' in src) ? src.value : src.textContent;
			if (navigator.clipboard && window.isSecureContext) {
				navigator.clipboard.writeText(text).then(function(){ flash(btn); });
				return;
			}
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			try { document.execCommand('copy'); flash(btn); } catch (err) {}
			document.body.removeChild(ta);
		});
	})();
	</script>
	<?php
}

/** "active 2 hours ago" / "never" */
function cb_time_ago( $ts ) {
	if ( ! $ts ) {
		return 'never';
	}
	return human_time_diff( $ts, time() ) . ' ago';
}

/** The Dashboard widget: connection state, what ran, and recipes for this site. */
function cb_dashboard_widget() {
	cb_print_ui_css();
	cb_print_copy_js();

	$last   = cb_last_seen();
	$recent = cb_activity_entries( 3 );
	$picks  = cb_cookbook_picks( 3 );
	$fresh  = $last && ( time() - $last ) < WEEK_IN_SECONDS;
	$dot    = $last ? ( $fresh ? '' : ' cb-idle' ) : ' cb-off';
	$state  = $last ? ( $fresh ? 'Connected' : 'Idle' ) : 'Not connected yet';
	?>
	<p style="margin:0 0 4px">
		<span class="cb-ui-dot<?php echo esc_attr( $dot ); ?>"></span>
		<b><?php echo esc_html( $state ); ?></b>
		<?php if ( $last ) : ?>
			<span style="color:#787c82">&middot; active <?php echo esc_html( cb_time_ago( $last ) ); ?></span>
		<?php else : ?>
			<span style="color:#787c82">&middot; <a href="<?php echo esc_url( admin_url( 'tools.php?page=claude-bridge' ) ); ?>">connect Claude to this site</a></span>
		<?php endif; ?>
		<?php if ( cb_connector_enabled() ) : ?>
			<span class="cb-ui-chip" style="margin-left:6px">Hub connector</span>
		<?php endif; ?>
	</p>

	<?php if ( $recent ) : ?>
		<div class="cb-ui-hd">Recent activity</div>
		<?php foreach ( $recent as $e ) : ?>
			<div class="cb-ui-row">
				<span class="cb-ui-grow cb-ui-mono<?php echo empty( $e['ok'] ) ? ' cb-ui-fail' : ''; ?>"><?php echo esc_html( cb_activity_label( $e ) ); ?></span>
				<span class="cb-ui-when"><?php echo esc_html( cb_time_ago( $e['t'] ) ); ?></span>
			</div>
		<?php endforeach; ?>
	<?php endif; ?>

	<div class="cb-ui-hd">Recipes picked for this site</div>
	<?php foreach ( $picks as $i => $r ) : $tid = 'cb-w-prompt-' . $r['id']; ?>
		<div class="cb-ui-row">
			<span class="cb-ui-grow">
				<a href="<?php echo esc_url( cb_cookbook_url( $r['id'] ) ); ?>"><?php echo esc_html( $r['title'] ); ?></a>
				<?php foreach ( array_slice( $r['tags'], 0, 1 ) as $t ) : ?>
					<span class="cb-ui-chip" style="margin-left:6px"><?php echo esc_html( $t ); ?></span>
				<?php endforeach; ?>
			</span>
			<button type="button" class="button button-small" data-cb-copy="<?php echo esc_attr( $tid ); ?>">Copy prompt</button>
			<textarea id="<?php echo esc_attr( $tid ); ?>" readonly hidden><?php echo esc_textarea( cb_recipe_clipboard( $r ) ); ?></textarea>
		</div>
	<?php endforeach; ?>

	<p class="cb-ui-note">Prompts copy with the recipe link. Fill the [bracketed] parts, or let your AI ask.</p>
	<p style="margin:0"><a href="<?php echo esc_url( cb_cookbook_url() ); ?>">Browse all <?php echo count( cb_cookbook_recipes() ); ?> recipes &rarr;</a></p>

	<div class="cb-ui-foot">
		<a href="<?php echo esc_url( admin_url( 'tools.php?page=claude-bridge#cb-activity' ) ); ?>">Activity log</a> &middot;
		<a href="<?php echo esc_url( admin_url( 'tools.php?page=claude-bridge' ) ); ?>">Connection</a> &middot;
		<a href="<?php echo esc_url( cb_cookbook_url() ); ?>">Cookbook</a>
	</div>
	<?php
}

/** Tools &rarr; Claude Cookbook: every recipe, filterable, with copy buttons. */
function cb_cookbook_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Insufficient permissions.' );
	}
	cb_print_ui_css();
	cb_print_copy_js();

	$tag    = isset( $_GET['tag'] ) ? sanitize_text_field( wp_unslash( $_GET['tag'] ) ) : '';
	$search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
	$only   = ! empty( $_GET['fits'] );
	$single = isset( $_GET['recipe'] ) ? sanitize_key( wp_unslash( $_GET['recipe'] ) ) : '';
	$stack  = cb_site_stack();
	$labels = cb_stack_labels();
	$base   = admin_url( 'tools.php?page=claude-bridge-cookbook' );

	$recipes = array();
	foreach ( cb_cookbook_recipes() as $r ) {
		$fits = cb_recipe_fits( $r, $stack );
		if ( $only && ! $fits ) {
			continue;
		}
		if ( $tag !== '' && ! in_array( $tag, $r['tags'], true ) ) {
			continue;
		}
		if ( $search !== '' ) {
			$hay = strtolower( $r['title'] . ' ' . $r['summary'] . ' ' . $r['prompt'] . ' ' . implode( ' ', $r['tags'] ) );
			if ( strpos( $hay, strtolower( $search ) ) === false ) {
				continue;
			}
		}
		$r['fits'] = $fits;
		$recipes[] = $r;
	}
	// A direct link to one recipe opens it expanded, at the top.
	if ( $single !== '' ) {
		usort( $recipes, function ( $a, $b ) use ( $single ) {
			return ( $a['id'] === $single ? 0 : 1 ) - ( $b['id'] === $single ? 0 : 1 );
		} );
	}

	$stack_names = array();
	foreach ( $stack as $k ) {
		$stack_names[] = esc_html( isset( $labels[ $k ] ) ? $labels[ $k ] : $k );
	}
	?>
	<div class="wrap">
		<h1>Claude Cookbook</h1>
		<p style="max-width:820px">Prompts for the jobs people actually hand to an AI on a WordPress site. Copy one, fill in the [bracketed] parts, and paste it into Claude with this site connected — every recipe is written for the tools this bridge exposes.</p>
		<p class="cb-ui-note">This site looks like: <?php echo implode( ' &middot; ', $stack_names ); // Each part escaped above. ?>. Recipes needing something you do not have are marked.</p>

		<form method="get" action="<?php echo esc_url( admin_url( 'tools.php' ) ); ?>" style="margin:14px 0 0">
			<input type="hidden" name="page" value="claude-bridge-cookbook">
			<?php if ( $tag !== '' ) : ?><input type="hidden" name="tag" value="<?php echo esc_attr( $tag ); ?>"><?php endif; ?>
			<input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="Search recipes&hellip;" style="width:280px">
			<label style="margin-left:10px"><input type="checkbox" name="fits" value="1" <?php checked( $only ); ?>> Only what fits this site</label>
			<?php submit_button( 'Filter', 'secondary', '', false ); ?>
			<?php if ( $search !== '' || $only || $tag !== '' ) : ?>
				<a href="<?php echo esc_url( $base ); ?>" style="margin-left:8px">Reset</a>
			<?php endif; ?>
		</form>

		<div class="cb-filters">
			<a href="<?php echo esc_url( add_query_arg( array( 's' => $search ? $search : null, 'fits' => $only ? 1 : null ), $base ) ); ?>" class="<?php echo $tag === '' ? 'cb-on' : ''; ?>">All</a>
			<?php foreach ( cb_cookbook_tags() as $t => $n ) : ?>
				<a href="<?php echo esc_url( add_query_arg( array( 'tag' => $t, 's' => $search ? $search : null, 'fits' => $only ? 1 : null ), $base ) ); ?>" class="<?php echo $tag === $t ? 'cb-on' : ''; ?>"><?php echo esc_html( $t ); ?> <span style="opacity:.6"><?php echo (int) $n; ?></span></a>
			<?php endforeach; ?>
		</div>

		<?php if ( ! $recipes ) : ?>
			<p>No recipe matches that. <a href="<?php echo esc_url( $base ); ?>">Show everything</a>.</p>
		<?php endif; ?>

		<div class="cb-cols">
		<?php foreach ( $recipes as $r ) :
			$tid  = 'cb-prompt-' . $r['id'];
			$open = ( $single !== '' && $r['id'] === $single );
			$need = array();
			foreach ( (array) $r['requires'] as $k ) {
				$need[] = isset( $labels[ $k ] ) ? $labels[ $k ] : $k;
			}
			?>
			<div class="cb-card" id="recipe-<?php echo esc_attr( $r['id'] ); ?>">
				<h2><?php echo esc_html( $r['title'] ); ?></h2>
				<p class="cb-meta">
					<?php foreach ( $r['tags'] as $t ) : ?>
						<span class="cb-ui-chip"><?php echo esc_html( $t ); ?></span>
					<?php endforeach; ?>
					<?php if ( $need ) : ?>
						<span class="cb-ui-chip<?php echo $r['fits'] ? ' cb-fit' : ''; ?>">Needs <?php echo esc_html( implode( ' / ', $need ) ); ?><?php echo $r['fits'] ? ' &check;' : ' &mdash; not installed'; ?></span>
					<?php endif; ?>
					<span style="margin-left:6px"><?php echo esc_html( $r['time'] ); ?></span>
				</p>
				<p class="cb-sum"><?php echo esc_html( $r['summary'] ); ?></p>
				<p style="margin:0 0 6px">
					<button type="button" class="button button-primary button-small" data-cb-copy="<?php echo esc_attr( $tid ); ?>">Copy prompt</button>
					<span class="cb-ui-note" style="margin-left:8px">Tools: <code style="font-size:11px"><?php echo esc_html( implode( ', ', $r['tools'] ) ); ?></code></span>
				</p>
				<details<?php echo $open ? ' open' : ''; ?>>
					<summary>Show the prompt</summary>
					<pre><?php echo esc_html( $r['prompt'] ); ?></pre>
				</details>
				<textarea id="<?php echo esc_attr( $tid ); ?>" readonly hidden><?php echo esc_textarea( cb_recipe_clipboard( $r ) ); ?></textarea>
			</div>
		<?php endforeach; ?>
		</div>

		<p style="margin-top:18px">Connected model? It can read this cookbook itself with the <code>list_recipes</code> and <code>get_recipe</code> tools &mdash; ask Claude &ldquo;what recipes fit this site?&rdquo;</p>
	</div>
	<?php
}
