import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sources = [
  'wp-claude-bridge.php',
  'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
  'dist/digi-ai-bridge/digi-ai-bridge.php',
]
const hasPhp = spawnSync('php', ['-v']).status === 0

const harness = String.raw`<?php
class WP_Error {
	public $code;
	public $message;
	function __construct( $code, $message ) { $this->code = $code; $this->message = $message; }
}
class FakeDb {
	function prepare( $query, $arg ) { return $query; }
	function get_var( $query ) { return 1; }
}
$wpdb = new FakeDb();
$options = array();
$backup_available = true;
function is_wp_error( $val ) { return $val instanceof WP_Error; }
function wp_normalize_path( $path ) { return str_replace( '\\', '/', $path ); }
function wp_generate_uuid4() { return bin2hex( random_bytes( 16 ) ); }
function cb_get_contents( $path ) { return file_get_contents( $path ); }
function add_option( $key, $value, $deprecated, $autoload ) {
	global $options, $backup_available;
	if ( ! $backup_available || false !== $autoload ) { return false; }
	$options[ $key ] = $value;
	return true;
}
function get_option( $key, $default = false ) { global $options; return $options[ $key ] ?? $default; }
function delete_option( $key ) { global $options; unset( $options[ $key ] ); }
function wp_get_upload_dir() { return array( 'basedir' => dirname( ABSPATH ) . '/public-uploads' ); }
define( 'ABSPATH', $argv[2] );
define( 'WP_CONTENT_DIR', ABSPATH . '/wp-content' );
$_SERVER['DOCUMENT_ROOT'] = ABSPATH;
$src = file_get_contents( $argv[1] );
$start = strpos( $src, 'function cb_op_edit_file(' );
eval( substr( $src, $start, strpos( $src, 'function cb_op_delete_file(', $start ) - $start ) );
$path = 'plugins/sample/main.php';
$target = WP_CONTENT_DIR . '/' . $path;
$old = "<?php return 'old';\n";
$new = "<?php return 'new';\n";
$args = array( 'path' => $path, 'search' => 'old', 'replace' => 'new' );
function expect( $ok, $label ) {
	if ( ! $ok ) { fwrite( STDERR, $label . "\n" ); exit( 1 ); }
}
$private = $argv[3];
$other_mount = $argv[4] ?? '';
$options['cb_file_edit_staging_dir'] = $private;
foreach ( array( 'relative', $private . '/missing', ABSPATH . '/wp-content', wp_get_upload_dir()['basedir'] ) as $bad_dir ) {
	$options['cb_file_edit_staging_dir'] = $bad_dir;
	$bad = cb_op_edit_file_with_backup( $args );
	expect( is_wp_error( $bad ) && $bad->code === 'cb_edit_staging', 'unsafe staging directory accepted' );
	expect( file_get_contents( $target ) === $old && count( $options ) === 1, 'unsafe staging changed file or left a snapshot' );
}
if ( $other_mount ) {
	$options['cb_file_edit_staging_dir'] = $other_mount;
	$bad = cb_op_edit_file_with_backup( $args );
	expect( is_wp_error( $bad ) && $bad->code === 'cb_edit_mount', 'different mount accepted' );
	expect( file_get_contents( $target ) === $old && count( $options ) === 1, 'mount failure changed original or left a snapshot' );
	unset( $options['cb_file_edit_staging_dir'] );
	$bad = cb_op_edit_file_with_backup( $args );
	expect( is_wp_error( $bad ) && $bad->code === 'cb_edit_mount', 'mismatched default PHP temp was accepted' );
	expect( file_get_contents( $target ) === $old && count( $options ) === 0, 'mismatched PHP temp changed original or left a snapshot' );
}
$options['cb_file_edit_staging_dir'] = $private;
$backup_available = false;
$failure = cb_op_edit_file_with_backup( $args );
expect( is_wp_error( $failure ) && $failure->code === 'cb_edit_backup', 'backup failure was not reported' );
expect( file_get_contents( $target ) === $old, 'file changed without a backup' );
$backup_available = true;
$invalid = cb_op_edit_file_with_backup( array( 'path' => $path, 'search' => "return 'old';", 'replace' => 'return (;' ) );
expect( is_wp_error( $invalid ) && $invalid->code === 'cb_edit_syntax', 'invalid PHP was accepted' );
expect( file_get_contents( $target ) === $old && count( $options ) === 1, 'invalid PHP changed the file or backup store' );

$first = cb_op_edit_file_with_backup( $args );
expect( ! is_wp_error( $first ), is_wp_error( $first ) ? $first->message : '' );
expect( file_get_contents( $target ) === $new, 'valid edit did not reach file' );
$snapshot = get_option( 'cb_file_edit_' . $first['backup_id'] );
expect( base64_decode( $snapshot['before'], true ) === $old, 'backup did not preserve the original bytes' );

$second = cb_op_edit_file_with_backup( array( 'path' => $path, 'search' => 'new', 'replace' => 'second' ) );
expect( ! is_wp_error( $second ), 'second edit failed' );
$stale = cb_op_restore_file_edit( $first );
expect( is_wp_error( $stale ) && $stale->code === 'cb_edit_changed', 'older backup overwrote a newer edit' );
expect( ! is_wp_error( cb_op_restore_file_edit( $second ) ) && file_get_contents( $target ) === $new, 'second edit was not restored' );
$options[ 'cb_file_edit_' . $first['backup_id'] ]['before'] = base64_encode( 'corrupted' );
$broken = cb_op_restore_file_edit( $first );
expect( is_wp_error( $broken ) && file_get_contents( $target ) === $new, 'corrupt backup overwrote the file' );
$options[ 'cb_file_edit_' . $first['backup_id'] ] = $snapshot;
expect( ! is_wp_error( cb_op_restore_file_edit( $first ) ) && file_get_contents( $target ) === $old, 'original bytes were not restored' );
expect( glob( $private . '/cb-edit-*' ) === array(), 'staging files were not cleaned up' );
`

const secondMount = process.platform === 'linux' && existsSync('/dev/shm') && statSync('/dev/shm').dev !== statSync(tmpdir()).dev

for (const source of sources) {
  test(`${source}: private staging and backed-up edits`, { skip: !hasPhp }, () => {
    const temp = mkdtempSync(join(tmpdir(), 'cb-file-edit-'))
    let crossMount
    try {
      const site = join(temp, 'wordpress')
      const plugin = join(site, 'wp-content', 'plugins', 'sample')
      const privateDir = join(temp, 'private')
      if (secondMount) crossMount = mkdtempSync('/dev/shm/cb-file-edit-')
      mkdirSync(plugin, { recursive: true })
      mkdirSync(privateDir, { mode: 0o700 })
      mkdirSync(join(temp, 'public-uploads'))
      writeFileSync(join(plugin, 'main.php'), "<?php return 'old';\n")
      const script = join(temp, 'test.php')
      writeFileSync(script, harness)
      const phpOpts = crossMount ? ['-d', `sys_temp_dir=${crossMount}`] : []
      const output = spawnSync('php', [...phpOpts, script, fileURLToPath(new URL(`../../${source}`, import.meta.url)), site, privateDir, crossMount || ''], { encoding: 'utf8' })
      assert.equal(output.status, 0, output.stderr || output.stdout)
    } finally {
      rmSync(temp, { recursive: true, force: true })
      if (crossMount) rmSync(crossMount, { recursive: true, force: true })
    }
  })
}
