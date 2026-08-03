// What an approval is worth when the site does not answer.
//
// Approving claims the proposal BEFORE the tool runs, which is what stops two
// people approving the same change into two identical edits. The cost of that
// ordering is a gap: if the call to the site then fails, the proposal reads
// "approved" while nothing was done — and someone reading the queue later sees
// a decision that was carried out, because that is what approved has meant.
//
// Against a real PostgreSQL, like the rest of the proposal tests: what is being
// checked is an UPDATE that must reach an already-resolved row, and testing
// that against a stand-in would test the stand-in.
import test from 'node:test'
import assert from 'node:assert/strict'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('proposal outcomes (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Its own schema — the runner runs files in parallel and they share table
  // names. See proposals.test.js for what sharing one cost.
  const TEST_SCHEMA = 'test_proposal_outcome'
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
      INSERT INTO sites (id) VALUES ('site-o') ON CONFLICT DO NOTHING;
    `)
    await query(PROPOSALS_SCHEMA)
    await query(EVENTS_SCHEMA)
  })

  test.beforeEach(() => query('DELETE FROM proposals; DELETE FROM events'))
  test.after(() => pool.end())

  const propose = (args) =>
    proposals.record({
      siteId: 'site-o',
      tool: 'flush_cache',
      args,
      kind: 'sensitive',
      reason: 'cache is stale',
    })

  test('an approval that failed on the site says so on the proposal', async () => {
    const row = await propose({ scope: 'all' })
    const claimed = await proposals.resolve('site-o', row.id, 'approved', { by: 'u_1' })
    assert.ok(claimed, 'the proposal was not claimable')

    await proposals.recordOutcome('site-o', row.id, {
      ok: false, at: Date.now(), error: 'site refused: 502',
    })

    const { rows } = await query('SELECT * FROM proposals WHERE id = $1', [row.id])
    assert.equal(rows[0].result.ok, false)
    assert.match(rows[0].result.error, /502/)
  })

  test('recording an outcome does not undo the approval', async () => {
    // Re-arming would invite the double execution the claim exists to prevent:
    // the request may well have reached the site and failed on the way back.
    const row = await propose({ scope: 'page' })
    await proposals.resolve('site-o', row.id, 'approved', { by: 'u_1' })
    await proposals.recordOutcome('site-o', row.id, { ok: false, error: 'boom' })

    const { rows } = await query('SELECT * FROM proposals WHERE id = $1', [row.id])
    assert.equal(rows[0].status, 'approved')
    assert.ok(rows[0].resolved_at, 'the resolution timestamp was lost')
    assert.equal(rows[0].resolved_by, 'u_1')
  })

  test('a successful run is recorded too, not just a failure', async () => {
    // Otherwise "no result" means both "it worked" and "nobody looked", and the
    // failure case stops being distinguishable again.
    const row = await propose({ scope: 'object' })
    await proposals.resolve('site-o', row.id, 'approved', { by: 'u_1' })
    await proposals.recordOutcome('site-o', row.id, { ok: true, at: Date.now() })

    const { rows } = await query('SELECT * FROM proposals WHERE id = $1', [row.id])
    assert.equal(rows[0].result.ok, true)
  })

  test('an outcome cannot be written onto another site\'s proposal', async () => {
    // Same scoping as every other read here: an id from elsewhere must not be
    // addressable.
    const row = await propose({ scope: 'cross' })
    await proposals.resolve('site-o', row.id, 'approved', { by: 'u_1' })

    const wrote = await proposals.recordOutcome('site-elsewhere', row.id, { ok: false })
    assert.equal(wrote, null)

    const { rows } = await query('SELECT * FROM proposals WHERE id = $1', [row.id])
    assert.equal(rows[0].result, null)
  })

  test('the proposal is still resolvable-once after an outcome is recorded', async () => {
    // The claim is what makes approval single-execution. Writing a result must
    // not reopen that door.
    const row = await propose({ scope: 'twice' })
    await proposals.resolve('site-o', row.id, 'approved', { by: 'u_1' })
    await proposals.recordOutcome('site-o', row.id, { ok: false, error: 'boom' })

    const second = await proposals.resolve('site-o', row.id, 'approved', { by: 'u_2' })
    assert.equal(second, null, 'the proposal became claimable a second time')
  })
}
