<?php
/**
 * Plugin Name: WP Claude Bridge
 * Description: Turns this WordPress site into a full self-hosted MCP server — edit theme AND plugin files, create plugins, activate themes/plugins, draft preview, cache flush, PLUS complete WordPress + WooCommerce control via a generic REST proxy. Connects to Claude via OAuth (auto login + consent) or a static Bearer token. Free alternative to WPVibe.
 * Version: 3.1.0
 * Author: Account City
 * License: GPLv2 or later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CB_VERSION', '3.1.0' );
define( 'CB_TOKEN_OPTION', 'cb_mcp_token' );
define( 'CB_PREVIEW_TRANSIENT', 'cb_preview_theme' );
define( 'CB_CLIENTS_OPTION', 'cb_oauth_clients' );

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

	return $tools;
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

	register_rest_route( $ns, '/mcp', array(
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => 'cb_mcp_handler',
		),
		array(
			'methods'             => 'GET',
			'permission_callback' => '__return_true',
			'callback'            => function () {
				return new WP_REST_Response( array( 'error' => 'Use POST for MCP JSON-RPC.' ), 405 );
			},
		),
	) );
} );

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
		wp_set_current_user( (int) $at['user_id'] );
		return true;
	}
	return false;
}

function cb_mcp_authorized( $request ) {
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

function cb_mcp_handler( $request ) {
	$body   = $request->get_json_params();
	$id     = isset( $body['id'] ) ? $body['id'] : null;
	$method = isset( $body['method'] ) ? $body['method'] : '';

	if ( strpos( $method, 'notifications/' ) === 0 ) {
		return new WP_REST_Response( null, 202 );
	}

	if ( ! cb_mcp_authorized( $request ) ) {
		$resp = new WP_REST_Response( array( 'jsonrpc' => '2.0', 'id' => $id, 'error' => array( 'code' => -32001, 'message' => 'Unauthorized.' ) ), 401 );
		$resp->header( 'WWW-Authenticate', 'Bearer resource_metadata="' . esc_url_raw( home_url( '/.well-known/oauth-protected-resource' ) ) . '"' );
		return $resp;
	}

	switch ( $method ) {
		case 'initialize':
			return cb_rpc( $id, array(
				'protocolVersion' => '2024-11-05',
				'capabilities'    => array( 'tools' => new stdClass() ),
				'serverInfo'      => array( 'name' => 'wp-claude-bridge', 'version' => CB_VERSION ),
			) );

		case 'ping':
			return cb_rpc( $id, new stdClass() );

		case 'tools/list':
			$tools = array();
			foreach ( cb_tools() as $t ) {
				$tools[] = array( 'name' => $t['name'], 'description' => $t['description'], 'inputSchema' => $t['inputSchema'] );
			}
			return cb_rpc( $id, array( 'tools' => $tools ) );

		case 'tools/call':
			$name = isset( $body['params']['name'] ) ? $body['params']['name'] : '';
			$args = isset( $body['params']['arguments'] ) ? (array) $body['params']['arguments'] : array();
			$res  = cb_run_tool( $name, $args );
			if ( is_wp_error( $res ) ) {
				return cb_rpc( $id, array( 'isError' => true, 'content' => array( array( 'type' => 'text', 'text' => $res->get_error_message() ) ) ) );
			}
			return cb_rpc( $id, array( 'content' => array( array( 'type' => 'text', 'text' => wp_json_encode( $res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) ) ) );
	}

	return cb_rpc_error( $id, -32601, "Unknown method: $method" );
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
		cb_oauth_issue( $data['user_id'], $client );
	} elseif ( $grant === 'refresh_token' ) {
		$rt = isset( $p['refresh_token'] ) ? $p['refresh_token'] : '';
		$rd = get_transient( 'cb_oauth_rt_' . $rt );
		if ( ! $rd ) {
			cb_oauth_json( array( 'error' => 'invalid_grant' ), 400 );
		}
		delete_transient( 'cb_oauth_rt_' . $rt );
		cb_oauth_issue( $rd['user_id'], $rd['client_id'] );
	}
	cb_oauth_json( array( 'error' => 'unsupported_grant_type' ), 400 );
}

function cb_oauth_issue( $user_id, $client_id ) {
	$at  = wp_generate_password( 64, false );
	$rt  = wp_generate_password( 64, false );
	$ttl = 30 * DAY_IN_SECONDS;
	set_transient( 'cb_oauth_at_' . $at, array( 'user_id' => (int) $user_id, 'client_id' => $client_id ), $ttl );
	set_transient( 'cb_oauth_rt_' . $rt, array( 'user_id' => (int) $user_id, 'client_id' => $client_id ), 90 * DAY_IN_SECONDS );
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

		<h2 style="margin-top:24px">Alternative: OAuth (login + consent)</h2>
		<p>Add a Custom Connector with the plain URL below; Claude will send you to log in and approve.</p>
		<p><code style="font-size:13px;padding:6px;background:#f6f7f7;display:inline-block"><?php echo esc_html( $mcp ); ?></code></p>

		<h2 style="margin-top:24px">Alternative: Bearer header</h2>
		<table class="form-table">
			<tr><th>URL</th><td><code><?php echo esc_html( $mcp ); ?></code></td></tr>
			<tr><th>Header</th><td><code>Authorization: Bearer <?php echo esc_html( $token ); ?></code></td></tr>
		</table>
		<form method="post"><?php wp_nonce_field( 'cb_regen' ); ?>
			<input type="hidden" name="cb_regen" value="1"><?php submit_button( 'Regenerate token', 'secondary' ); ?>
		</form>
	</div>
	<?php
}
