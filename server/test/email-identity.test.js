// One mailbox, one account: spellings that reach the same inbox fold into
// one key, and registering a second spelling is refused.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { canonicalEmail } from '../src/email-identity.js'

test('Gmail dots, case, +tags and googlemail.com fold into one key', () => {
  const key = 'shm379@gmail.com'
  for (const spelling of [
    'shm379@gmail.com',
    'shm.379@gmail.com',
    'shm.3.7.9@gmail.com',
    'shm37.9@gmail.com',
    'SHM.379@Gmail.com',
    '  shm379@gmail.com ',
    'shm379+site@gmail.com',
    's.h.m.379+a.b@gmail.com',
    'shm379@googlemail.com',
  ]) {
    assert.equal(canonicalEmail(spelling), key, spelling)
  }
})

test('dots are meaningful outside Gmail; +tags are not', () => {
  assert.equal(canonicalEmail('ali.reza@example.com'), 'ali.reza@example.com')
  assert.notEqual(canonicalEmail('ali.reza@example.com'), canonicalEmail('alireza@example.com'))
  assert.equal(canonicalEmail('ali+shop@outlook.com'), 'ali@outlook.com')
})

test('odd input is left alone rather than mangled', () => {
  assert.equal(canonicalEmail(''), '')
  assert.equal(canonicalEmail(null), '')
  assert.equal(canonicalEmail('no-at-sign'), 'no-at-sign')
  assert.equal(canonicalEmail('+only@example.com'), '+only@example.com')
})

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('registration with email variants (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_email_identity'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
  await query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  await init()
  const { users } = await import('../src/store.js')
  const uniq = () => crypto.randomBytes(4).toString('hex')

  test('a second spelling of a registered Gmail inbox is refused', async () => {
    const base = `u${uniq()}`
    await users.create({ email: `${base}@gmail.com`, password: 'password-1', name: 'A' })
    for (const variant of [`${base.slice(0, 2)}.${base.slice(2)}@gmail.com`, `${base}+x@gmail.com`, `${base}@googlemail.com`]) {
      await assert.rejects(
        users.create({ email: variant, password: 'password-1', name: 'B' }),
        (e) => e.status === 409, variant,
      )
    }
  })

  test('login/reset lookup finds the one account behind another spelling', async () => {
    const base = `v${uniq()}`
    const u = await users.create({ email: `${base.slice(0, 3)}.${base.slice(3)}@gmail.com`, password: 'password-1', name: 'A' })
    const row = await users.byEmailRaw(`${base}@gmail.com`)
    assert.equal(row?.id, u.id)
  })

  test('two old accounts sharing an inbox are never guessed between', async () => {
    const base = `w${uniq()}`
    // Rows from before the rule: inserted directly, then backfilled by init().
    for (const email of [`${base}@gmail.com`, `${base.slice(0, 2)}.${base.slice(2)}@gmail.com`]) {
      await pool.query(
        `INSERT INTO users (id, email, name, pass_hash, created_at) VALUES ($1, $2, 'Old', 'x', $3)`,
        [`u_${uniq()}`, email, Date.now()],
      )
    }
    await init()
    assert.equal(await users.byEmailRaw(`${base}+tag@gmail.com`), null)
    // The exact address still logs in as itself.
    assert.equal((await users.byEmailRaw(`${base}@gmail.com`))?.email, `${base}@gmail.com`)
  })

  test('deleting an account frees its inbox for a new registration', async () => {
    const base = `d${uniq()}`
    const u = await users.create({ email: `${base}@gmail.com`, password: 'password-1', name: 'A' })
    await users.anonymize(u.id)
    const again = await users.create({ email: `${base.slice(0, 2)}.${base.slice(2)}@gmail.com`, password: 'password-1', name: 'A2' })
    assert.ok(again.id)
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
