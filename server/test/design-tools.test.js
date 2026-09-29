// The design tools (Gutenberg blocks + Elementor) are promises about honesty,
// not just features: a preview that saves nothing, pages that land as drafts
// for human review, an Elementor palette that says "not available" instead of
// inventing one, and in-place appends treated with edit_file's caution.
//
// None of that can be exercised without a live WordPress site, so this pins
// the structure statically across the canonical source and both generated
// release artifacts — the same trick safe-update-pipeline.test.js and
// plugin-tool-dispatch.test.js use, for the same reason: a regression here is
// a silent behavioural change, not a crash anyone notices.
//
// The specific regressions this guards against have all happened elsewhere in
// this plugin before: a noargs flag that silently dropped a tool's arguments,
// a list op that touched a missing plugin class and took the request down,
// and an edit that wrote to a post it never loaded.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { READ_TOOLS, MUTATING_TOOLS, SENSITIVE_TOOLS } from '../src/authority.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sources = [
  'wp-claude-bridge.php',
  'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
  'dist/digi-ai-bridge/digi-ai-bridge.php',
].map((p) => ({ p, src: readFileSync(join(root, p), 'utf8') }))

const DESIGN_TOOLS = [
  { name: 'list_block_types', op: 'cb_op_list_block_types' },
  { name: 'render_blocks', op: 'cb_op_render_blocks' },
  { name: 'create_block_page', op: 'cb_op_create_block_page' },
  { name: 'append_blocks', op: 'cb_op_append_blocks' },
  { name: 'list_elementor_widgets', op: 'cb_op_list_elementor_widgets' },
  { name: 'elementor_page_create', op: 'cb_op_elementor_page_create' },
  { name: 'elementor_section_append', op: 'cb_op_elementor_section_append' },
]

/**
 * One top-level function body, bounded by the next column-0 `function `
 * declaration — so an "includes" or "comes before" check cannot accidentally
 * read past the end of the function it names.
 */
function fn(src, p, decl) {
  const start = src.indexOf(decl)
  assert.ok(start !== -1, `${p} is missing ${decl}`)
  const end = src.indexOf('\nfunction ', start + 1)
  return src.slice(start, end === -1 ? undefined : end)
}

test('all seven design tools are registered with their exact names and ops', () => {
  for (const { p, src } of sources) {
    for (const { name, op } of DESIGN_TOOLS) {
      // One-line registrations on purpose: plugin-tool-dispatch.test.js reads
      // them line by line, so name and op must stay on the same line.
      assert.ok(
        new RegExp(`'name' => '${name}'.*'op' => '${op}'`).test(src),
        `${p} does not register ${name} -> ${op} on one line`,
      )
    }
  }
})

test('noargs flags match what the ops actually read', () => {
  for (const { p, src } of sources) {
    // The only design tool that ignores its arguments is the Elementor widget
    // listing: empty stdClass schema, noargs set.
    assert.ok(
      /'name' => 'list_elementor_widgets'.*'properties' => new stdClass\(\)/.test(src),
      `${p}: a noargs tool must advertise an empty object schema (stdClass, not array)`,
    )
    assert.ok(
      /'name' => 'list_elementor_widgets'.*'noargs' => true/.test(src),
      `${p}: list_elementor_widgets takes no arguments and must say so`,
    )
    // render_blocks and the list ops READ their arguments (specs / search).
    // noargs would not be a convenience: dispatch calls a noargs op with
    // array(), so the caller's specs would be silently dropped and the
    // "preview" would preview nothing.
    assert.ok(
      !/'name' => 'render_blocks'.*'noargs' => true/.test(src),
      `${p}: render_blocks takes required specs and must not be noargs`,
    )
    assert.ok(
      !/'name' => 'list_block_types'.*'noargs' => true/.test(src),
      `${p}: list_block_types takes an optional search and must not be noargs`,
    )
    // Every design op declares a defaulted parameter, so dispatch's single
    // call_user_func($op, ...) can never raise ArgumentCountError.
    for (const { op } of DESIGN_TOOLS) {
      assert.ok(
        src.includes(`function ${op}( $args = array() )`),
        `${p}: ${op} must be declared as ( $args = array() )`,
      )
    }
  }
})

test('one block markup compiler serves the preview and every writer', () => {
  for (const { p, src } of sources) {
    assert.ok(src.includes('function cb_blocks_markup('), `${p} is missing the shared markup compiler`)
    // render_blocks' whole value is that it previews EXACTLY what the writers
    // write; that promise only holds while all of them go through the same
    // compiler instead of each building markup its own way.
    for (const op of ['cb_op_render_blocks', 'cb_op_create_block_page', 'cb_op_append_blocks']) {
      assert.ok(
        fn(src, p, `function ${op}(`).includes('cb_blocks_markup('),
        `${p}: ${op} must compile specs through cb_blocks_markup`,
      )
    }
  }
})

test('the widget listing says Elementor is off instead of touching its API', () => {
  for (const { p, src } of sources) {
    // The shared gate checks the class exists BEFORE reading the static
    // instance — the other order is a fatal error on every non-Elementor site.
    const gate = fn(src, p, 'function cb_elementor_plugin(')
    const checked = gate.indexOf("class_exists( '\\Elementor\\Plugin' )")
    const accessed = gate.indexOf('\\Elementor\\Plugin::$instance')
    assert.ok(checked !== -1 && accessed !== -1 && checked < accessed,
      `${p}: cb_elementor_plugin must class_exists-check before touching \\Elementor\\Plugin::$instance`)
    // The listing op gates on that helper BEFORE it reaches widgets_manager,
    // and its inactive branch is an honest ok=false, not a made-up palette.
    const op = fn(src, p, 'function cb_op_list_elementor_widgets(')
    const gated = op.indexOf('cb_elementor_plugin()')
    const manager = op.indexOf('widgets_manager')
    assert.ok(gated !== -1 && manager !== -1 && gated < manager,
      `${p}: list_elementor_widgets must check Elementor availability before the widgets manager`)
    assert.ok(op.includes("'ok' => false") && op.includes('المنتور روی این سایت فعال نیست'),
      `${p}: the inactive-Elementor answer must be an honest failure, not invented data`)
    // The two Elementor writers refuse honestly on the same gate before they
    // write anything.
    for (const wop of ['cb_op_elementor_page_create', 'cb_op_elementor_section_append']) {
      const body = fn(src, p, `function ${wop}(`)
      const refuse = body.indexOf('cb_elementor_plugin()')
      const write = body.indexOf('cb_elementor_write_document(')
      assert.ok(refuse !== -1, `${p}: ${wop} must gate on cb_elementor_plugin()`)
      assert.ok(write !== -1, `${p}: ${wop} must contain its document write`)
      assert.ok(refuse < write, `${p}: ${wop} must refuse before writing when Elementor is inactive`)
    }
  }
})

test('append tools validate the post before writing to it', () => {
  const cases = [
    { op: 'cb_op_append_blocks', write: 'wp_update_post(', missing: 'نوشته‌ای با این شناسه پیدا نشد' },
    { op: 'cb_op_elementor_section_append', write: 'cb_elementor_write_document(', missing: 'برگه‌ای با این شناسه پیدا نشد' },
  ]
  for (const { p, src } of sources) {
    for (const { op, write, missing } of cases) {
      const body = fn(src, p, `function ${op}(`)
      const loaded = body.indexOf('get_post( $post_id )')
      const writes = body.indexOf(write)
      assert.ok(loaded !== -1, `${p}: ${op} must load the post it is asked to edit`)
      assert.ok(writes !== -1, `${p}: ${op} must contain its write call (${write})`)
      assert.ok(loaded < writes, `${p}: ${op} must validate the post BEFORE writing to it`)
      // Writing to a revision (or a trashed post) would succeed technically
      // and change nothing the visitor sees — the checks must keep refusing.
      assert.ok(body.includes("! $post || 'revision' === $post->post_type"),
        `${p}: ${op} must refuse revisions, not append into them`)
      assert.ok(body.includes(missing), `${p}: ${op} must say the post was not found`)
    }
  }
})

test('the server classifies the design tools by consequence', () => {
  // Reads observe; creates are recoverable (a draft, a delete); appends edit
  // a page that is already live — edit_file's precedent, a human every time.
  // An unclassified copy of these names already fails closed as sensitive;
  // this pins the intended classification against list drift.
  for (const name of ['list_block_types', 'render_blocks', 'list_elementor_widgets']) {
    assert.ok(READ_TOOLS.includes(name), `${name} must be classified read`)
  }
  for (const name of ['create_block_page', 'elementor_page_create']) {
    assert.ok(MUTATING_TOOLS.includes(name), `${name} must be classified mutating`)
  }
  for (const name of ['append_blocks', 'elementor_section_append']) {
    assert.ok(SENSITIVE_TOOLS.includes(name), `${name} must be classified sensitive`)
  }
})

test('all three sources are the 3.9.0 design-tools release', () => {
  for (const { p, src } of sources) {
    assert.ok(
      /define\(\s*'CB_VERSION',\s*'3\.9\.0'\s*\);/.test(src),
      `${p} must pin CB_VERSION to 3.9.0`,
    )
  }
})
