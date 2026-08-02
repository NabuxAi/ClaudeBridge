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
  // Its own PostgreSQL schema, because the test runner runs files in parallel
  // and every database-touching file here creates and drops the SAME table
  // names. Sharing one schema meant one file's teardown deleted another file's
  // tables mid-test — 15 failures that moved around between runs. A search_path
  // per file makes the isolation structural instead of a matter of timing.
  const TEST_SCHEMA = 'test_proposals'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)

  const { pool, query } = await import('../src/db.js')
  const { SCHEMA: PROPOSALS_SCHEMA } = await import('../src/proposals.schema.js')
  const { SCHEMA: EVENTS_SCHEMA } = await import('../src/events.schema.js')
  const proposals = await import('../src/proposals.js')

  test.before(async () => {
    await query(`
      CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA};
      DROP TABLE IF EXISTS alert_deliveries;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS proposals;
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);
      INSERT INTO sites (id) VALUES ('site-a'), ('site-b') ON CONFLICT DO NOTHING;
    `)
    await query(PROPOSALS_SCHEMA)
    await query(EVENTS_SCHEMA)
  })

  test.beforeEach(() => query('DELETE FROM proposals; DELETE FROM events'))

  // events.record() is fire-and-forget on purpose — a failed alert must not
  // fail the answer — so an assertion has to wait for it rather than assume it
  // already landed.
  //
  // Scoped to one proposal's fingerprint rather than "any open proposal event
  // on this site". Because the write is unawaited it can land AFTER the next
  // test's cleanup, and a query that matches any proposal event then picks up
  // an orphan from the previous test. Asking only about this proposal removes
  // the coupling instead of racing it.
  const alertsFor = async (siteId, proposalId, { expect = 1 } = {}) => {
    let rows = []
    for (let i = 0; i < 40; i++) {
      ;({ rows } = await query(
        `SELECT * FROM events
         WHERE site_id = $1 AND fingerprint = $2 AND resolved_at IS NULL`,
        [siteId, `proposal:${proposalId}`]
      ))
      if (rows.length >= expect) return rows
      await new Promise((r) => setTimeout(r, 25))
    }
    return rows
  }

  // Settle anything still in flight so one test's unawaited write cannot land
  // inside the next one.
  const settle = () => new Promise((r) => setTimeout(r, 150))

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

  test('a new proposal raises an alert naming the tool', async () => {
    // Durable and on the page is not the same as anyone knowing. Without this
    // a proposal waits until someone happens to open that site's page.
    const p = await proposals.record(make())
    const [ev] = await alertsFor('site-a', p.id)

    assert.ok(ev, 'a new proposal should raise an event')
    assert.match(ev.title, /flush_cache/)
    assert.equal(ev.detail.proposalId, p.id)
    assert.equal(ev.fingerprint, `proposal:${p.id}`)
    await settle()
  })

  test('the same proposal made again does not raise a second alert', async () => {
    // The assistant re-proposes on every retry. One decision is one alert.
    const first = await proposals.record(make())
    await alertsFor('site-a', first.id)

    const again = await proposals.record(make())
    assert.equal(again.id, first.id, 'the retry should be the same row')
    await settle()

    assert.equal((await alertsFor('site-a', first.id)).length, 1)
    await settle()
  })

  test('deciding a proposal closes its alert', async () => {
    // An inbox that keeps showing what was already decided is one people stop
    // reading.
    const p = await proposals.record(make())
    await alertsFor('site-a', p.id)

    await proposals.resolve('site-a', p.id, 'approved', { by: 'u_2' })

    for (let i = 0; i < 40; i++) {
      if ((await alertsFor('site-a', p.id, { expect: 0 })).length === 0) break
      await new Promise((r) => setTimeout(r, 25))
    }
    assert.equal((await alertsFor('site-a', p.id, { expect: 0 })).length, 0)
    await settle()
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
