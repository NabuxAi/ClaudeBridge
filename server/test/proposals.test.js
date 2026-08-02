// Proposals, against a real PostgreSQL.
//
// Skipped unless CB_TEST_DATABASE_URL names one. The two properties worth
// testing here are both database properties — a partial unique index and a
// conditional UPDATE — so testing them against a stand-in would test the
// stand-in.
import test from 'node:test'
import assert from 'node:assert/strict'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('proposals (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  process.env.DATABASE_URL = dsn

  const { pool, query } = await import('../src/db.js')
  const { SCHEMA: PROPOSALS_SCHEMA } = await import('../src/proposals.schema.js')
  const proposals = await import('../src/proposals.js')

  test.before(async () => {
    await query(`
      DROP TABLE IF EXISTS proposals;
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY);
      INSERT INTO sites (id) VALUES ('site-a'), ('site-b') ON CONFLICT DO NOTHING;
    `)
    await query(PROPOSALS_SCHEMA)
  })

  test.beforeEach(() => query('DELETE FROM proposals'))

  test.after(async () => {
    await query('DROP TABLE IF EXISTS proposals')
    await pool.end()
  })

  const make = (over = {}) => ({
    siteId: 'site-a',
    userId: 'u_1',
    tool: 'flush_cache',
    args: { scope: 'all' },
    kind: 'mutating',
    reason: 'needs approval',
    ...over,
  })

  test('a proposal survives being written and read back', async () => {
    const written = await proposals.record(make())
    assert.equal(written.tool, 'flush_cache')
    assert.equal(written.status, 'pending')

    const [found] = await proposals.pending('site-a')
    assert.equal(found.id, written.id)
    // The arguments must round-trip: approving has to run the proposal, not a
    // version of it the panel retyped.
    assert.deepEqual(found.args, { scope: 'all' })
  })

  test('the same change proposed twice stays one row', async () => {
    // The assistant re-proposes the same thing every time it is asked the same
    // question. A list that grows a row per retry is a list nobody reads.
    const a = await proposals.record(make())
    const b = await proposals.record(make())

    assert.equal(a.id, b.id)
    assert.equal((await proposals.pending('site-a')).length, 1)
  })

  test('different arguments are different proposals', async () => {
    await proposals.record(make())
    await proposals.record(make({ args: { scope: 'page' } }))

    assert.equal((await proposals.pending('site-a')).length, 2)
  })

  test('resolving takes it out of pending and keeps the row', async () => {
    const p = await proposals.record(make())
    const done = await proposals.resolve('site-a', p.id, 'approved', { by: 'u_2' })

    assert.equal(done.status, 'approved')
    assert.equal(done.resolved_by, 'u_2')
    assert.equal((await proposals.pending('site-a')).length, 0)
    // Kept, because "who approved the plugin deletion" is what an audit asks.
    assert.ok(await proposals.get('site-a', p.id))
  })

  test('only the first of two simultaneous approvals wins', async () => {
    // The property that stops one approval running the same change twice.
    const p = await proposals.record(make())

    const [first, second] = await Promise.all([
      proposals.resolve('site-a', p.id, 'approved', { by: 'u_1' }),
      proposals.resolve('site-a', p.id, 'approved', { by: 'u_2' }),
    ])

    const winners = [first, second].filter(Boolean)
    assert.equal(winners.length, 1, 'exactly one approval should claim the proposal')
  })

  test('a resolved proposal cannot be resolved again', async () => {
    const p = await proposals.record(make())
    await proposals.resolve('site-a', p.id, 'approved', { by: 'u_1' })

    assert.equal(await proposals.resolve('site-a', p.id, 'rejected', { by: 'u_2' }), null)
  })

  test('a proposal cannot be read or resolved through another site', async () => {
    const p = await proposals.record(make())

    assert.equal(await proposals.get('site-b', p.id), null)
    assert.equal(await proposals.resolve('site-b', p.id, 'approved', { by: 'u_9' }), null)
  })

  test('resolving the same change again after approval opens a fresh proposal', async () => {
    // The partial index only covers pending rows, so an approved change can be
    // proposed again later — which is right: flushing the cache twice in a week
    // is two decisions, not one.
    const first = await proposals.record(make())
    await proposals.resolve('site-a', first.id, 'approved', { by: 'u_1' })

    const second = await proposals.record(make())
    assert.notEqual(second.id, first.id)
    assert.equal((await proposals.pending('site-a')).length, 1)
  })
}
