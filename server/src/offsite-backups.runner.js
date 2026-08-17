// Background runner: stream a site backup off-site to an S3-compatible target.
import * as connector from './connector.js'
import { uploadToS3 } from './s3-upload.js'
import { offsiteBackups } from './offsite-backups.store.js'

function unwrap(raw) {
  const text = raw?.content?.[0]?.text
  return typeof text === 'string' ? JSON.parse(text) : raw
}

/**
 * Read the latest verified site backup and upload it to the configured target.
 *
 * This runs after the HTTP response has already been sent. Errors are recorded
 * on the job row, not thrown to the caller.
 */
export async function runOffsiteBackup(site, target, jobId) {
  const mark = async (status, { sizeBytes, error } = {}) => {
    try {
      await offsiteBackups.updateJob(jobId, {
        status,
        completedAt: Date.now(),
        sizeBytes: sizeBytes ?? null,
        error: error ?? null,
      })
    } catch {
      // If we cannot write the job outcome, the failure is already logged by
      // the unhandled path below. Do not throw from the mark helper.
    }
  }

  try {
    const targetWithSecret = await offsiteBackups.getTargetWithSecret(site.id, target.id)
    if (!targetWithSecret) throw new Error('هدف پشتیبان یافت نشد.')

    const siteConn = { url: site.url, secret: site.secret, siteKey: site.site_key }

    // 1. Find the latest backup on the site.
    const listRaw = await connector.callTool(siteConn, 'backup_list', {})
    const list = unwrap(listRaw)
    const backups = Array.isArray(list?.backups) ? list.backups : []
    if (!backups.length) throw new Error('هیچ بکاپی روی سایت یافت نشد.')
    const backup = backups[0]

    // 2. Pull the database dump slice by slice from the site.
    const chunks = []
    let offset = 0
    for (let guard = 0; guard < 20000; guard++) {
      const raw = await connector.callTool(siteConn, 'backup_read', { id: backup.id, what: 'db', offset })
      const part = unwrap(raw)
      if (part?.error) throw new Error(part.error)
      if (part?.chunk) chunks.push(Buffer.from(part.chunk, 'base64'))
      if (part?.eof) break
      if (!part?.read) throw new Error('خواندن فایل بکاپ متوقف شد.')
      offset = part.offset + part.read
    }
    const payload = Buffer.concat(chunks)

    // 3. Build the object key: pathPrefix/backup-id.sql
    const key = [target.pathPrefix, `${backup.id}.sql`]
      .filter(Boolean)
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\/+/, '')

    // 4. Upload to the S3-compatible target.
    await uploadToS3({
      endpoint: target.endpoint,
      bucket: target.bucket,
      region: target.region || 'us-east-1',
      accessKeyId: target.accessKeyId,
      secretAccessKey: targetWithSecret.secretAccessKey,
      key,
      body: payload,
      contentType: 'application/sql',
    })

    await mark('done', { sizeBytes: payload.length })
  } catch (e) {
    await mark('failed', { error: e.message })
  }
}
