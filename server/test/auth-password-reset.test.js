// Password reset flow: hashed single-use tokens, enumeration-safe responses,
// rate limits, and expiry. See AGENTS.md P0.3.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('password reset (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_password_reset'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.EMAIL_URL = 'http://localhost:9999/mock-email'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { hashPassword } = await import('../src/auth.js')
  const { users, passwordResets } = await import('../src/store.js')

  async function makeUser(email) {
    const { rows } = await pool.query(
      `INSERT INTO users (id, email, name, pass_hash, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [`u_${crypto.randomBytes(4).toString('hex')}`, email, 'Test', await hashPassword('old-password'), Date.now()]
    )
    return rows[0]
  }

  test('creating a reset token stores its hash, not the raw token', async () => {
    const user = await makeUser(`reset-${crypto.randomBytes(4).toString('hex')}@example.com`)
    const { raw, id } = await passwordResets.create(user.id)

    const { rows } = await query('SELECT token_hash FROM password_resets WHERE id = $1', [id])
    assert.equal(rows[0].token_hash, crypto.createHash('sha256').update(raw).digest('hex'))
    assert.notEqual(rows[0].token_hash, raw)
  })

  test('the same user gets only one active token', async () => {
    const user = await makeUser(`reset-once-${crypto.randomBytes(4).toString('hex')}@example.com`)
    const first = await passwordResets.create(user.id)
    const second = await passwordResets.create(user.id)

    const { rows } = await query('SELECT COUNT(*)::int AS n FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id])
    assert.equal(rows[0].n, 1)

    // A new creation replaces the old token hash while keeping the same row id.
    const found = await passwordResets.find(crypto.createHash('sha256').update(second.raw).digest('hex'))
    assert.ok(found)
    assert.equal(found.id, first.id)

    const old = await passwordResets.find(crypto.createHash('sha256').update(first.raw).digest('hex'))
    assert.equal(old, null)
  })

  test('expired tokens are rejected', async () => {
    const user = await makeUser(`reset-expired-${crypto.randomBytes(4).toString('hex')}@example.com`)
    const { raw, id } = await passwordResets.create(user.id)
    await query('UPDATE password_resets SET expires_at = $2 WHERE id = $1', [id, Date.now() - 1000])

    const found = await passwordResets.find(crypto.createHash('sha256').update(raw).digest('hex'))
    assert.equal(found, null)
  })

  test('used tokens are rejected', async () => {
    const user = await makeUser(`reset-used-${crypto.randomBytes(4).toString('hex')}@example.com`)
    const { raw, id } = await passwordResets.create(user.id)
    await passwordResets.markUsed(id)

    const found = await passwordResets.find(crypto.createHash('sha256').update(raw).digest('hex'))
    assert.equal(found, null)
  })

  test('updatePassword changes the password', async () => {
    const user = await makeUser(`reset-pw-${crypto.randomBytes(4).toString('hex')}@example.com`)
    await users.updatePassword(user.id, 'new-password-123')

    const { verifyPassword } = await import('../src/auth.js')
    const row = await users.byEmailRaw(user.email)
    assert.ok(await verifyPassword('new-password-123', row.pass_hash))
    assert.ok(!(await verifyPassword('old-password', row.pass_hash)))
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
