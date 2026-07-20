<?php
/**
 * Plugin Name: WP Claude Bridge
 * Description: Turns this WordPress site into a full self-hosted MCP server — edit theme AND plugin files, create plugins, activate themes/plugins, draft preview, cache flush, PLUS complete WordPress + WooCommerce control via a generic REST proxy. Connects to Claude via OAuth using WordPress's native, revocable Application Passwords, or a static Bearer token / token-in-URL. Bundles WordPress engineering skills the connected model can load on demand (as tools, MCP resources, and prompts), and exposes several fallback connection modes (REST, admin-ajax, query-var; JSON or SSE) so it can still connect when a host or security layer blocks one path. Free alternative to WPVibe.
 * Version: 3.5.1
 * Author: Account City
 * License: GPLv2 or later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CB_VERSION', '3.5.1' );
define( 'CB_TOKEN_OPTION', 'cb_mcp_token' );
define( 'CB_PREVIEW_TRANSIENT', 'cb_preview_theme' );
define( 'CB_CLIENTS_OPTION', 'cb_oauth_clients' );
define( 'CB_CONNECTOR_OPTION', 'cb_connector' ); // Hub-connector pairing: server URL + shared secret.

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

function cb_run_tool( $name, $args ) {
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
	</div>
	<?php
}
