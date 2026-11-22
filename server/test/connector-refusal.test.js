// A refused hub request must say WHY.
//
// The 2026-11-22 game30t.com incident: every signed call answered the same
// `rest_forbidden` 401, so "the key on the site changed" and "the host's
// database refused a write" looked identical from the hub. This cuts the
// plugin's real signature check out of each shipped source and runs it under
// PHP with WordPress stubbed, one scenario per reason.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCES = [
  'wp-claude-bridge.php',
  'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
  'dist/digi-ai-bridge/digi-ai-bridge.php',
]
const hasPhp = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0

const HARNESS = `<?php
class WP_Error {
	private $c; private $m; private $d;
	function __construct( $c, $m, $d ) { $this->c = $c; $this->m = $m; $this->d = $d; }
	function get_error_code() { return $this->c; }
	function get_error_message() { return $this->m; }
	function get_error_data() { return $this->d; }
}
function is_wp_error( $v ) { return $v instanceof WP_Error; }
function __( $s, $d = null ) { return $s; }
$scenario = json_decode( $argv[2], true );
function cb_connector() { global $scenario; return array( 'secret' => $scenario['secret'], 'site_id' => 'site' ); }
function cb_connector_header( $n ) { global $scenario; return isset( $scenario['headers'][ $n ] ) ? $scenario['headers'][ $n ] : ''; }
$options = array();
function add_option( $k, $v ) { global $scenario, $options; if ( $scenario['db'] === 'broken' || isset( $options[ $k ] ) ) return false; $options[ $k ] = $v; return true; }
function get_option( $k ) { global $options; return isset( $options[ $k ] ) ? $options[ $k ] : false; }
$src = file_get_contents( $argv[1] );
foreach ( array( 'function cb_connector_signature_check(', 'function cb_connector_refusal(' ) as $decl ) {
	$a = strpos( $src, $decl );
	if ( false === $a ) { fwrite( STDERR, "missing $decl\\n" ); exit( 1 ); }
	eval( substr( $src, $a, strpos( $src, "\\nfunction ", $a + 1 ) - $a ) );
}
$out = array();
for ( $i = 0; $i < $scenario['repeat']; $i++ ) {
	$r = cb_connector_signature_check();
	$out[] = true === $r ? array( 'ok' => true ) : array( 'code' => $r->get_error_code(), 'data' => $r->get_error_data(), 'message' => $r->get_error_message() );
}
echo json_encode( $out );
`

const SECRET = 'a'.repeat(64)
function signed({ secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const nonce = crypto.randomBytes(16).toString('hex')
  const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n`).digest('hex')
  return { 'X-DigiWP-Timestamp': String(ts), 'X-DigiWP-Nonce': nonce, 'X-DigiWP-Signature': sig }
}

function run(p, scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'cb-refusal-'))
  const file = join(dir, 'harness.php')
  try {
    writeFileSync(file, HARNESS)
    const r = spawnSync('php', [file, join(root, p), JSON.stringify({ secret: SECRET, db: 'ok', repeat: 1, ...scenario })], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${p}: php harness failed: ${r.stderr}`)
    return JSON.parse(r.stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const skip = hasPhp ? false : 'php CLI not available here — signature check not executed'

test('a correct signature passes once and a replay is named as a replay', { skip }, () => {
  for (const p of SOURCES) {
    const [first, again] = run(p, { headers: signed(), repeat: 2 })
    assert.deepEqual(first, { ok: true }, p)
    assert.equal(again.code, 'cb_nonce_replayed', p)
    assert.equal(again.data.status, 401, p)
  }
})

test('each refusal names its own reason', { skip }, () => {
  for (const p of SOURCES) {
    assert.equal(run(p, { secret: '', headers: signed() })[0].code, 'cb_connector_unpaired', p)
    assert.equal(run(p, { headers: {} })[0].code, 'cb_signature_missing', p)
    assert.equal(run(p, { headers: signed({ secret: 'b'.repeat(64) }) })[0].code, 'cb_signature_invalid', p)

    const stale = run(p, { headers: signed({ ts: Math.floor(Date.now() / 1000) - 900 }) })[0]
    assert.equal(stale.code, 'cb_signature_expired', p)
    assert.equal(typeof stale.data.site_time, 'number', `${p}: the clock refusal shows the site's own time`)
  }
})

test('a database that refuses the nonce write is a 503 storage failure, never a key problem', { skip }, () => {
  for (const p of SOURCES) {
    const [r] = run(p, { headers: signed(), db: 'broken' })
    assert.equal(r.code, 'cb_nonce_store_failed', p)
    assert.equal(r.data.status, 503, p)
  }
})

test('the storage reason is reachable only behind a valid signature', { skip }, () => {
  for (const p of SOURCES) {
    // A forged signature against a broken database still reads as a key
    // mismatch: unsigned callers cannot use the refusal to probe storage.
    assert.equal(run(p, { headers: signed({ secret: 'b'.repeat(64) }), db: 'broken' })[0].code, 'cb_signature_invalid', p)
  }
})

test('the ping route and the MCP endpoints report the reason', () => {
  for (const p of SOURCES) {
    const src = readFileSync(join(root, p), 'utf8')
    assert.match(src, /'\/connector\/ping'[\s\S]{0,120}'permission_callback' => 'cb_connector_signature_check'/, p)
    assert.equal(src.split("'error' => cb_mcp_unauthorized_error()").length - 1, 2, `${p}: REST and fallback MCP transports both carry the reason`)
  }
})
