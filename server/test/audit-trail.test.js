// The audit trail, against a real database.
//
// The claim in the code is that anything which changed a site is written down,
// "whether a human asked for it or the assistant did it under standing
// authority". That claim is the whole reason the log exists, and nothing tested
// it — the write is .catch()-swallowed by design, so if it silently stopped
// working every other test would still pass and the log would just be empty.
//
// Skipped unless CB_TEST_DATABASE_URL names a PostgreSQL, because a swallowed
// write can only be observed by looking in the table it was supposed to reach.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('audit trail (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Its own PostgreSQL schema, because the test runner runs files in parallel
  // and every database-touching file here creates and drops the SAME table
  // names. Sharing one schema meant one file's teardown deleted another file's
  // tables mid-test — 15 failures that moved around between runs. A search_path
  // per file makes the isolation structural instead of a matter of timing.
  const TEST_SCHEMA = 'test_audit'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.ASSISTANT_URL = 'https://gateway.test'
  process.env.ASSISTANT_API_KEY = 'test-key'
  process.env.ASSISTANT_MODEL = 'nabu-smart'
  process.env.LIVE = '1'

  const { pool, query } = await import('../src/db.js')
  const { SCHEMA: EVENTS_SCHEMA } = await import('../src/events.schema.js')
  const { SCHEMA: PROPOSALS_SCHEMA } = await import('../src/proposals.schema.js')
  const assistant = await import('../src/assistant.js')

  const SITE = {
    id: 'site-audit',
    url: 'https://example.test',
    secret: 's3cr3t',
    site_key: 'k',
    paired: true,
    authority: 'auto',
  }

  const realFetch = globalThis.fetch

  test.before(async () => {
    await query(`
      CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA};
      DROP TABLE IF EXISTS alert_deliveries;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS proposals;
      CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY);
      INSERT INTO sites (id) VALUES ('site-audit') ON CONFLICT DO NOTHING;
    `)
    await query(EVENTS_SCHEMA)
    await query(PROPOSALS_SCHEMA)
  })

  test.beforeEach(() => query('DELETE FROM events'))

  test.after(async () => {
    globalThis.fetch = realFetch
    // alert_deliveries has a foreign key onto events, so events cannot be
    // dropped first. CASCADE would also work; naming the dependant is clearer
    // about why the order matters.
    await query(`
      DROP TABLE IF EXISTS alert_deliveries;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS proposals;
    `)
    await pool.end()
  })

  const call = (name, args = {}) => ({
    role: 'assistant',
    content: null,
    tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  })

  /** Model asks for one tool, then answers. Both hops are HTTP, so one stub does. */
  function stub(toolName, args = {}) {
    const turns = [call(toolName, args), { role: 'assistant', content: 'انجام شد.' }]
    let turn = 0
    globalThis.fetch = async (url, opts) => {
      const target = String(url)
      if (target.startsWith('https://gateway.test')) {
        const message = turns[Math.min(turn++, turns.length - 1)]
        return { ok: true, status: 200, json: async () => ({ choices: [{ message }] }) }
      }
      if (target.startsWith('https://example.test')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: { content: [{ text: '{"ok":true}' }] } }),
        }
      }
      return realFetch(url, opts)
    }
  }

  /** The write is unawaited by design, so wait for it instead of assuming. */
  const actionEvents = async ({ expect = 1 } = {}) => {
    let rows = []
    for (let i = 0; i < 60; i++) {
      ;({ rows } = await query(
        `SELECT * FROM events WHERE site_id = 'site-audit' AND kind = 'action'
         ORDER BY created_at DESC`
      ))
      if (rows.length >= expect) return rows
      await new Promise((r) => setTimeout(r, 25))
    }
    return rows
  }

  const settle = () => new Promise((r) => setTimeout(r, 200))

  test('a change the assistant makes itself is written down', async () => {
    // `auto` is the level where the assistant acts without asking. That is
    // exactly when nobody witnesses the change, so the record is the only
    // evidence it happened.
    stub('flush_cache')
    await assistant.answer(SITE, 'کش را پاک کن')

    const [ev] = await actionEvents()
    assert.ok(ev, 'a mutating tool run under auto authority should be logged')
    assert.match(ev.title, /flush_cache/)
    assert.equal(ev.detail.by, 'assistant')
    assert.equal(ev.detail.op, 'flush_cache')
    // The authority it acted under, because "was it allowed to?" is the first
    // question anyone asks of a change nobody remembers.
    assert.equal(ev.detail.authority, 'auto')
    await settle()
  })

  test('reading the site is not logged as a change', async () => {
    // A log that records every read is one nobody can find a real change in.
    stub('site_info')
    await assistant.answer(SITE, 'وضعیت سایت چطور است؟')
    await settle()

    assert.equal((await actionEvents({ expect: 0 })).length, 0)
  })

  test('a refused change is not logged as having happened', async () => {
    // Under `report` the tool never runs, and an audit trail that records
    // attempts as actions is worse than none: it manufactures history.
    stub('flush_cache')
    await assistant.answer({ ...SITE, authority: 'report' }, 'کش را پاک کن')
    await settle()

    assert.equal((await actionEvents({ expect: 0 })).length, 0)
  })

  test('the arguments are kept, not just the tool name', async () => {
    // "Someone changed a plugin" is not an audit record. Which plugin, to what,
    // is. set_plugin_state is a real mutating tool — deliberately not a made-up
    // name, because an unknown tool classifies as sensitive and is never run at
    // all, which would make this pass for the wrong reason.
    stub('set_plugin_state', { plugin: 'akismet', state: 'inactive' })
    await assistant.answer(SITE, 'افزونه را غیرفعال کن')

    const [ev] = await actionEvents()
    assert.ok(ev, 'the plugin change should be logged')
    assert.deepEqual(ev.detail.args, { plugin: 'akismet', state: 'inactive' })
    await settle()
  })

  test('a tool the policy does not know is refused, not run', async () => {
    // The default that makes the list above safe to extend: a tool that lands
    // in the plugin before it lands in the policy is treated as destructive, so
    // it needs a human even under `auto`. Nothing runs, so nothing is logged as
    // having run.
    stub('update_plugin', { plugin: 'akismet' })
    const answer = await assistant.answer(SITE, 'افزونه را به‌روزرسانی کن')
    await settle()

    assert.equal((await actionEvents({ expect: 0 })).length, 0)
    assert.ok(
      (answer.proposals || []).some((p) => p.tool === 'update_plugin'),
      'an unknown tool should come back as a proposal for a human'
    )
  })
}
