// Demo seed must be opt-in and must never create a known demo account in an
// empty production-style database. See AGENTS.md P0.1.
import test from 'node:test'
import assert from 'node:assert/strict'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('demo seed guard (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_seed_guard'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  // SEED_DEMO intentionally left unset.

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  test('init without SEED_DEMO leaves the users table empty', async () => {
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM users')
    assert.equal(rows[0].n, 0, 'no demo user should be seeded by default')

    const demo = await query('SELECT 1 FROM users WHERE email = $1', ['maryam@example.com'])
    assert.equal(demo.rowCount, 0, 'the known demo account must not exist')
  })

  test('seedDemo still runs when the opt-in flag is enabled', async () => {
    const { config } = await import('../src/config.js')
    config.seedDemo = true
    await init()

    const { rows } = await query('SELECT email FROM users')
    assert.equal(rows.length, 1, 'demo user should be seeded when flag is on')
    assert.equal(rows[0].email, 'maryam@example.com')
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
