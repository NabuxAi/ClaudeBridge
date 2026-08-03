// Every tool the plugin advertises must be callable the way it is dispatched.
//
// `security_scan` was registered with `'noargs' => true`, which makes the
// dispatcher call the op with no arguments — while the op declared a required
// parameter. Every call therefore threw ArgumentCountError, which cannot be
// caught at that layer, so WordPress answered the whole REST request with its
// generic critical-error page. The nightly scan had been failing on live sites
// and the only record of it read "tool security_scan failed".
//
// This reads the plugin source rather than running PHP, because the mismatch is
// visible statically and the failure it causes is not: a fatal takes the
// endpoint down before anything can report on itself.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sources = [
  'wp-claude-bridge.php',
  'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
  'dist/digi-ai-bridge/digi-ai-bridge.php',
]

/**
 * Tool registrations, one per line.
 *
 * Each is written as a single `$tools[] = array( ... );` line, so the parse is
 * line-based on purpose: a pattern spanning the file pairs one tool's op with
 * a later tool's flags and invents failures that do not exist.
 */
function registrations(src) {
  const out = []
  for (const line of src.split('\n')) {
    if (!line.includes('$tools[]')) continue
    const name = /'name'\s*=>\s*'([a-z_]+)'/.exec(line)
    const op = /'op'\s*=>\s*'([a-z_]+)'/.exec(line)
    if (!name || !op) continue
    out.push({
      tool: name[1],
      op: op[1],
      noargs: /'noargs'\s*=>\s*true/.test(line),
      line,
    })
  }
  return out
}

const noargsTools = (src) => registrations(src).filter((r) => r.noargs)

/** The parameter list of a PHP function, or null when it is not defined here. */
function params(src, fn) {
  const m = new RegExp(`function\\s+${fn}\\s*\\(([^)]*)\\)`).exec(src)
  return m ? m[1].trim() : null
}

for (const rel of sources) {
  const src = readFileSync(join(root, rel), 'utf8')

  test(`${rel}: no noargs tool dispatches to an op that requires an argument`, () => {
    const offenders = []
    for (const { tool, op } of noargsTools(src)) {
      const p = params(src, op)
      // A parameter with no default is required, and the noargs path supplies
      // nothing for it.
      if (p && p.length > 0 && !p.includes('=')) offenders.push(`${tool} -> ${op}(${p})`)
    }
    assert.deepEqual(offenders, [], `these would fatal on every call: ${offenders.join(', ')}`)
  })

  test(`${rel}: a tool advertising inputs is not marked noargs`, () => {
    // security_scan advertised max_files and was marked noargs, so the cap was
    // silently discarded even once the fatal was gone. Advertising an argument
    // the dispatcher throws away is its own defect.
    const offenders = []
    for (const r of registrations(src)) {
      if (!r.noargs) continue
      // An empty schema is written as new stdClass(); a real one names properties.
      const props = /'properties'\s*=>\s*array\(\s*'([a-z_]+)'/.exec(r.line)
      if (props) offenders.push(`${r.tool} advertises ${props[1]}`)
    }
    assert.deepEqual(offenders, [], `noargs tools cannot accept input: ${offenders.join(', ')}`)
  })

  test(`${rel}: security_scan takes its arguments and tolerates none`, () => {
    // Both halves of the fix, pinned: it is dispatched with arguments, and it
    // still cannot fatal if it is ever called without them.
    const p = params(src, 'cb_op_security_scan')
    assert.ok(p !== null, 'cb_op_security_scan is missing')
    assert.match(p, /=/, 'the parameter has no default, so a bare call still fatals')

    const reg = registrations(src).find((r) => r.tool === 'security_scan')
    assert.ok(reg, 'security_scan is not registered')
    assert.equal(reg.noargs, false,
      'security_scan advertises max_files, so it must receive arguments')
  })
}

test('the dispatcher hands noargs ops an empty array, not nothing', () => {
  // The class fix. Calling with nothing is what turned a declared parameter
  // into an uncatchable fatal; PHP ignores surplus arguments to a user
  // function, so an empty array is safe for ops that take none.
  const src = readFileSync(join(root, 'wp-claude-bridge.php'), 'utf8')
  const dispatch = /function cb_run_tool_dispatch[\s\S]*?\n}/.exec(src)
  assert.ok(dispatch, 'cb_run_tool_dispatch is missing')
  assert.match(dispatch[0], /call_user_func\(\s*\$t\['op'\],\s*array\(\)\s*\)/)
})
