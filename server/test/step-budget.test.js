// The per-question tool budget.
//
// It was a constant, which meant a "work out why the checkout is broken"
// question got the same five steps as "is my site up to date?" — and silently
// truncating the first produces a confident, incomplete answer, which is the
// worst outcome available.
//
// A budget is a bound on how much one question may do to a live site, so the
// interesting cases are all about a caller not being able to remove that bound.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.ASSISTANT_MAX_TOOL_STEPS = '10'

const { stepBudget } = await import('../src/assistant.js')

test('no request keeps the default', () => {
  assert.equal(stepBudget(undefined), 5)
  assert.equal(stepBudget(null), 5)
})

test('a caller may ask for more, up to the ceiling', () => {
  assert.equal(stepBudget(8), 8)
  assert.equal(stepBudget(10), 10)
})

test('the ceiling cannot be exceeded', () => {
  // The property that keeps this a bound rather than a suggestion.
  assert.equal(stepBudget(11), 10)
  assert.equal(stepBudget(10_000), 10)
  assert.equal(stepBudget(Infinity), 5, 'Infinity is not an integer, so it falls back')
})

test('nonsense falls back to the default rather than being clamped', () => {
  // Clamping 0 to 1 gives an assistant that can make exactly one call and then
  // must answer — more likely a bug in the caller than a request. The default
  // is the safer reading.
  for (const bad of [0, -1, -100, 2.5, 'seven', '', '  ', {}, [], NaN, true]) {
    assert.equal(stepBudget(bad), 5, `stepBudget(${JSON.stringify(bad)}) should default`)
  }
})

test('a numeric string is accepted, since it arrives over JSON', () => {
  assert.equal(stepBudget('8'), 8)
})
