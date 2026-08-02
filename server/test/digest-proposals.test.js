// The digest is the only notification that leaves this deployment.
//
// No push, SMS or e-mail channel is configured, so a proposal that reached only
// the panel reached whoever happened to open it. These cover the section that
// puts waiting decisions into the one message that is actually sent.
import test from 'node:test'
import assert from 'node:assert/strict'

const { renderPendingProposals } = await import('../src/digest.js')

const p = (over = {}) => ({
  site_id: 'site-1', site_name: 'example.test',
  tool: 'flush_cache', args: {}, kind: 'mutating', ...over,
})

test('nothing waiting adds nothing to the digest', () => {
  // A daily message that says "0 waiting" every day is one people stop reading.
  assert.equal(renderPendingProposals([]), '')
  assert.equal(renderPendingProposals(undefined), '')
})

test('a waiting proposal names the site and the tool', () => {
  const out = renderPendingProposals([p()])

  assert.match(out, /example\.test/)
  assert.match(out, /flush_cache/)
  assert.match(out, /1/)
})

test('arguments are included, because the tool name alone is not the decision', () => {
  const out = renderPendingProposals([p({ tool: 'set_plugin_state', args: { plugin: 'akismet', state: 'inactive' } })])

  assert.match(out, /akismet/)
  assert.match(out, /inactive/)
})

test('a sensitive proposal is marked differently from a mutating one', () => {
  const sensitive = renderPendingProposals([p({ kind: 'sensitive' })])
  const mutating = renderPendingProposals([p({ kind: 'mutating' })])

  assert.notEqual(sensitive, mutating)
})

test('the list is capped and says how many it withheld', () => {
  // A list that silently stops at ten reads as "ten waiting".
  const many = Array.from({ length: 14 }, (_, i) => p({ tool: `tool_${i}`, args: { i } }))
  const out = renderPendingProposals(many)

  assert.match(out, /14/, 'the true total should appear')
  assert.match(out, /4/, 'the withheld count should appear')
})

test('html in a tool argument cannot break the message', () => {
  // Telegram parses this as HTML, and arguments are data from a model.
  const out = renderPendingProposals([p({ args: { note: '<b>x</b>&y' } })])

  assert.ok(!out.includes('<b>x</b>'), 'raw markup must not survive into the message')
  assert.match(out, /&lt;b&gt;/)
  assert.match(out, /&amp;/)
})

test('a site with no name falls back to its id rather than printing nothing', () => {
  const out = renderPendingProposals([p({ site_name: null })])

  assert.match(out, /site-1/)
})
