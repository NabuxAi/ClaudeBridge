// End-to-end tests for off-site (S3-compatible) backups.
//
// Covers target CRUD, credential encryption, and triggering an upload job
// against a real PostgreSQL database with stubbed plugin/S3 servers.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('off-site backups (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_offsite_backups'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.OFFSITE_BACKUP_KEY = 'offsite-test-key-32bytes-long!!!'
  process.env.LIVE = '1'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { createApp } = await import('../src/index.js')
  const { requireAuth } = await import('../src/auth.js')
  const { default: offsiteRouter } = await import('../src/routes/offsite-backups.js')
  const { users, sites } = await import('../src/store.js')
  const { signToken } = await import('../src/auth.js')

  const app = createApp()
  app.use('/v1', requireAuth, offsiteRouter)
  // The factory mounts its error handler before this router was added, so add
  // a matching handler after our router so the test output stays clean.
  app.use((err, _req, res, _next) => {
    if (!err.status || err.status >= 500) console.error(err)
    res.status(err.status || 500).json({ message: err.message || 'server error' })
  })

  // ---- Stub servers ------------------------------------------------
  const backupPayload = Buffer.from('-- test database dump\nSELECT 1;\n')

  const pluginServer = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      let payload = {}
      try { payload = JSON.parse(body) } catch {}
      const { name, arguments: args = {} } = payload.params || {}

      if (name === 'backup_list') {
        return res.end(JSON.stringify({
          jsonrpc: '2.0', id: payload.id,
          result: { content: [{ type: 'text', text: JSON.stringify({
            backups: [{ id: 'cb_test_1', label: 'manual', db_bytes: backupPayload.length, files_bytes: 0, verified: true }],
            bytes: backupPayload.length,
          }) }] },
        }))
      }

      if (name === 'backup_read') {
        const chunk = backupPayload.toString('base64')
        return res.end(JSON.stringify({
          jsonrpc: '2.0', id: payload.id,
          result: { content: [{ type: 'text', text: JSON.stringify({
            id: args.id, what: args.what, offset: 0, read: backupPayload.length,
            chunk, eof: true, filename: `${args.id}.sql`, size: backupPayload.length,
          }) }] },
        }))
      }

      res.statusCode = 400
      res.end(JSON.stringify({ error: 'unknown tool' }))
    })
  })
  await new Promise((r) => pluginServer.listen(0, '127.0.0.1', r))
  const pluginUrl = `http://127.0.0.1:${pluginServer.address().port}`

  const s3Server = createServer((req, res) => {
    let body = Buffer.alloc(0)
    req.on('data', (c) => { body = Buffer.concat([body, c]) })
    req.on('end', () => {
      s3Server.lastBody = body
      s3Server.lastContentSha256 = req.headers['x-amz-content-sha256']
      s3Server.lastAuthorization = req.headers.authorization
      res.setHeader('etag', '"test-etag"')
      res.writeHead(200)
      res.end()
    })
  })
  await new Promise((r) => s3Server.listen(0, '127.0.0.1', r))
  const s3Url = `http://127.0.0.1:${s3Server.address().port}`

  // ---- App server --------------------------------------------------
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const send = async (path, opts = {}) => {
    const res = await fetch(API + path, opts)
    const text = await res.text().catch(() => '')
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, body }
  }

  const owner = async () => {
    const email = `offsite-${crypto.randomUUID()}@test.local`
    const user = await users.create({ email, name: 'Offsite Test', password: 'a-strong-password-123' })
    const token = signToken({ sub: user.id, name: user.name })
    return { user, authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  }

  const makeSite = async (auth) => {
    // Use a unique path so the site id differs per test, while keeping the
    // connector URL pointed at our single stub plugin server.
    const site = await sites.add(auth.user.id, { name: `${pluginUrl}/${crypto.randomUUID()}`, title: 'Offsite Test Site' })
    await query('UPDATE sites SET url = $1 WHERE id = $2', [pluginUrl, site.id])
    await sites.markPaired(site.id, {})
    return site
  }

  const targetBody = (overrides = {}) => ({
    endpoint: s3Url,
    bucket: 'digiwp-backups',
    region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    pathPrefix: 'site-a',
    retentionDays: 14,
    ...overrides,
  })

  test('an owner can CRUD off-site backup targets', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const empty = await send(`/sites/${site.id}/offsite-backups/targets`, { headers: auth })
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.targets, [])

    const missing = await send(`/sites/${site.id}/offsite-backups/targets`, {
      method: 'POST', headers: auth, body: JSON.stringify({ endpoint: s3Url }),
    })
    assert.equal(missing.status, 400)

    const created = await send(`/sites/${site.id}/offsite-backups/targets`, {
      method: 'POST', headers: auth, body: JSON.stringify(targetBody()),
    })
    assert.equal(created.status, 201)
    assert.ok(created.body.id, 'target must have an id')
    assert.equal(created.body.endpoint, s3Url)
    assert.equal(created.body.bucket, 'digiwp-backups')
    assert.ok(!('secretAccessKey' in created.body), 'secret must not be returned')

    const list = await send(`/sites/${site.id}/offsite-backups/targets`, { headers: auth })
    assert.equal(list.body.targets.length, 1)

    const get = await send(`/sites/${site.id}/offsite-backups/targets/${created.body.id}`, { headers: auth })
    assert.equal(get.status, 200)
    assert.equal(get.body.accessKeyId, 'AKIAIOSFODNN7EXAMPLE')

    const updated = await send(`/sites/${site.id}/offsite-backups/targets/${created.body.id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ region: 'eu-west-1', retentionDays: 60 }),
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.region, 'eu-west-1')
    assert.equal(updated.body.retentionDays, 60)

    const removed = await send(`/sites/${site.id}/offsite-backups/targets/${created.body.id}`, {
      method: 'DELETE', headers: auth,
    })
    assert.equal(removed.status, 200)

    const after = await send(`/sites/${site.id}/offsite-backups/targets`, { headers: auth })
    assert.equal(after.body.targets.length, 0)
  })

  test('target secrets are encrypted and decrypted round-trip', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const created = await send(`/sites/${site.id}/offsite-backups/targets`, {
      method: 'POST', headers: auth, body: JSON.stringify(targetBody({ secretAccessKey: 'round-trip-secret' })),
    })
    const id = created.body.id

    const { rows } = await query(
      'SELECT secret_access_key_encrypted FROM offsite_backup_targets WHERE id = $1',
      [id]
    )
    const stored = rows[0].secret_access_key_encrypted
    assert.ok(!stored.includes('round-trip-secret'), 'stored value must not contain the raw secret')

    const { offsiteBackups } = await import('../src/offsite-backups.store.js')
    const withSecret = await offsiteBackups.getTargetWithSecret(site.id, id)
    assert.equal(withSecret.secretAccessKey, 'round-trip-secret')
  })

  test('one owner cannot see another owner\'s target', async () => {
    const a = await owner()
    const b = await owner()
    const siteA = await makeSite(a)
    await makeSite(b)

    const created = await send(`/sites/${siteA.id}/offsite-backups/targets`, {
      method: 'POST', headers: a, body: JSON.stringify(targetBody()),
    })

    const cross = await send(`/sites/${siteA.id}/offsite-backups/targets/${created.body.id}`, { headers: b })
    assert.equal(cross.status, 404)
  })

  test('triggering a job uploads the latest site backup to S3', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const created = await send(`/sites/${site.id}/offsite-backups/targets`, {
      method: 'POST', headers: auth, body: JSON.stringify(targetBody()),
    })
    const targetId = created.body.id

    const trigger = await send(`/sites/${site.id}/offsite-backups/jobs`, {
      method: 'POST', headers: auth, body: JSON.stringify({ targetId }),
    })
    assert.equal(trigger.status, 202)
    assert.equal(trigger.body.queued, true)
    assert.equal(trigger.body.job.status, 'queued')

    // Poll until terminal.
    let job = null
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150))
      const list = await send(`/sites/${site.id}/offsite-backups/jobs`, { headers: auth })
      job = list.body.jobs.find((j) => j.id === trigger.body.job.id)
      if (job && (job.status === 'done' || job.status === 'failed')) break
    }

    assert.ok(job, 'job must exist after polling')
    assert.equal(job.status, 'done', `job failed: ${job.error}`)
    assert.equal(job.sizeBytes, backupPayload.length)

    assert.ok(s3Server.lastBody, 'S3 server should have received a body')
    assert.ok(s3Server.lastBody.equals(backupPayload), 'uploaded body must match the backup')
    assert.equal(s3Server.lastContentSha256, crypto.createHash('sha256').update(backupPayload).digest('hex'))
    assert.ok(s3Server.lastAuthorization.includes('AWS4-HMAC-SHA256'), 'request must be SigV4 signed')
  })

  test('triggering a job for an unpaired site is refused', async () => {
    const auth = await owner()
    const site = await sites.add(auth.user.id, { name: `${pluginUrl}/${crypto.randomUUID()}`, title: 'Unpaired' })

    const created = await send(`/sites/${site.id}/offsite-backups/targets`, {
      method: 'POST', headers: auth, body: JSON.stringify(targetBody()),
    })

    const trigger = await send(`/sites/${site.id}/offsite-backups/jobs`, {
      method: 'POST', headers: auth, body: JSON.stringify({ targetId: created.body.id }),
    })
    assert.equal(trigger.status, 400)
    assert.ok(trigger.body.message.includes('وصل نشده'))
  })

  test.after(async () => {
    server.close()
    pluginServer.close()
    s3Server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
