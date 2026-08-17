// Persistent store for off-site (S3-compatible) backup targets and jobs.
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { config } from './config.js'

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

/** Derive a 32-byte AES key from the configured OFFSITE_BACKUP_KEY. */
function deriveKey() {
  const raw = config.offsiteBackupKey
  if (!raw) return null
  const buf = Buffer.from(raw, 'utf8')
  if (buf.length === 32) return buf
  return crypto.createHash('sha256').update(buf).digest()
}

function encrypt(plain) {
  const key = deriveKey()
  if (!key) throw httpError(503, 'کلید رمزنگاری بکاپ خارجی روی سرور تنظیم نشده.')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

function decrypt(stored) {
  const key = deriveKey()
  if (!key) throw httpError(503, 'کلید رمزنگاری بکاپ خارجی روی سرور تنظیم نشده.')
  const [ivHex, tagHex, encHex] = String(stored || '').split(':')
  if (!ivHex || !tagHex || !encHex) throw httpError(400, 'رمزنگاری ذخیره‌شده نامعتبر است.')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

function normalizeEndpoint(v) {
  return String(v || '').trim().replace(/\/$/, '')
}

function normalizePrefix(v) {
  return String(v || '')
    .trim()
    .replace(/^[\/]+|[\/]+$/g, '')
}

const publicTarget = (t) => t && ({
  id: t.id,
  siteId: t.site_id,
  type: t.type,
  endpoint: t.endpoint,
  bucket: t.bucket,
  region: t.region,
  accessKeyId: t.access_key_id,
  pathPrefix: t.path_prefix,
  retentionDays: Number(t.retention_days),
  createdAt: Number(t.created_at),
})

const publicJob = (j) => j && ({
  id: j.id,
  siteId: j.site_id,
  targetId: j.target_id,
  status: j.status,
  startedAt: Number(j.started_at),
  completedAt: j.completed_at != null ? Number(j.completed_at) : null,
  sizeBytes: j.size_bytes != null ? Number(j.size_bytes) : null,
  error: j.error || null,
  createdAt: Number(j.created_at),
})

export const offsiteBackups = {
  async listTargets(siteId) {
    return (await all(
      'SELECT * FROM offsite_backup_targets WHERE site_id = $1 ORDER BY created_at DESC',
      [siteId]
    )).map(publicTarget)
  },

  async getTarget(siteId, targetId) {
    return publicTarget(await one(
      'SELECT * FROM offsite_backup_targets WHERE id = $1 AND site_id = $2',
      [targetId, siteId]
    ))
  },

  /** Return the target with its decrypted secret — for the upload runner only. */
  async getTargetWithSecret(siteId, targetId) {
    const row = await one(
      'SELECT * FROM offsite_backup_targets WHERE id = $1 AND site_id = $2',
      [targetId, siteId]
    )
    if (!row) return null
    return { ...publicTarget(row), secretAccessKey: decrypt(row.secret_access_key_encrypted) }
  },

  async create(siteId, fields) {
    const {
      type = 's3',
      endpoint,
      bucket,
      region = '',
      accessKeyId,
      secretAccessKey,
      pathPrefix = '',
      retentionDays = 30,
    } = fields || {}

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw httpError(400, 'نشانی S3، نام باکت، Access Key ID و Secret Access Key لازم است.')
    }

    const id = newId('obt_')
    const now = Date.now()
    const row = await one(
      `INSERT INTO offsite_backup_targets
         (id, site_id, type, endpoint, bucket, region, access_key_id, secret_access_key_encrypted,
          path_prefix, retention_days, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        id, siteId, type, normalizeEndpoint(endpoint), bucket, region, accessKeyId,
        encrypt(secretAccessKey), normalizePrefix(pathPrefix), Number(retentionDays) || 30, now,
      ]
    )
    return publicTarget(row)
  },

  async update(siteId, targetId, patch) {
    const existing = await one(
      'SELECT * FROM offsite_backup_targets WHERE id = $1 AND site_id = $2',
      [targetId, siteId]
    )
    if (!existing) throw httpError(404, 'هدف پشتیبان یافت نشد.')

    const sets = []
    const values = []
    const add = (col, val) => { sets.push(`${col} = $${values.length + 1}`); values.push(val) }

    if ('type' in patch) add('type', patch.type)
    if ('endpoint' in patch) add('endpoint', normalizeEndpoint(patch.endpoint))
    if ('bucket' in patch) add('bucket', patch.bucket)
    if ('region' in patch) add('region', patch.region)
    if ('accessKeyId' in patch) add('access_key_id', patch.accessKeyId)
    if ('secretAccessKey' in patch) add('secret_access_key_encrypted', encrypt(patch.secretAccessKey))
    if ('pathPrefix' in patch) add('path_prefix', normalizePrefix(patch.pathPrefix))
    if ('retentionDays' in patch) add('retention_days', Number(patch.retentionDays) || 30)

    if (!sets.length) return publicTarget(existing)

    values.push(targetId)
    const row = await one(
      `UPDATE offsite_backup_targets SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    )
    return publicTarget(row)
  },

  async remove(siteId, targetId) {
    const row = await one(
      'DELETE FROM offsite_backup_targets WHERE id = $1 AND site_id = $2 RETURNING id',
      [targetId, siteId]
    )
    if (!row) throw httpError(404, 'هدف پشتیبان یافت نشد.')
    return { ok: true }
  },

  async listJobs(siteId, { targetId, limit = 50 } = {}) {
    const params = [siteId]
    let sql = 'SELECT * FROM offsite_backup_jobs WHERE site_id = $1'
    if (targetId) {
      sql += ' AND target_id = $2'
      params.push(targetId)
    }
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
    params.push(Number(limit) || 50)
    return (await all(sql, params)).map(publicJob)
  },

  async createJob(siteId, targetId) {
    const id = newId('obj_')
    const now = Date.now()
    const row = await one(
      `INSERT INTO offsite_backup_jobs
         (id, site_id, target_id, status, started_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, siteId, targetId, 'queued', now, now]
    )
    return publicJob(row)
  },

  async updateJob(jobId, { status, completedAt, sizeBytes, error }) {
    const sets = []
    const values = []
    const add = (col, val) => { sets.push(`${col} = $${values.length + 1}`); values.push(val) }
    if (status != null) add('status', status)
    if (completedAt != null) add('completed_at', completedAt)
    if (sizeBytes != null) add('size_bytes', sizeBytes)
    if (error !== undefined) add('error', error)
    if (!sets.length) return null
    values.push(jobId)
    return publicJob(await one(
      `UPDATE offsite_backup_jobs SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    ))
  },

  async getJob(siteId, jobId) {
    return publicJob(await one(
      'SELECT * FROM offsite_backup_jobs WHERE id = $1 AND site_id = $2',
      [jobId, siteId]
    ))
  },
}
