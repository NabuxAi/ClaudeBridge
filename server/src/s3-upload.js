// S3-compatible single-PUT uploader using AWS Signature Version 4.
//
// Built on Node's built-in crypto and the global fetch so no AWS SDK is needed.
// This intentionally covers the common case: upload a database dump or zip to
// any S3-compatible endpoint (AWS S3, MinIO, Wasabi, Cloudflare R2, etc.).
// Large files should use multipart upload; this module is the first slice and
// uploads the payload as one object.
import crypto from 'node:crypto'

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest()
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

function isoDate(d = new Date()) {
  return d.toISOString().replace(/[-:]|[.]\d{3}/g, '')
}

function encodePath(path) {
  return path
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
}

/**
 * Upload a buffer to an S3-compatible bucket with SigV4 signing.
 *
 * @param {Object} opts
 * @param {string} opts.endpoint   e.g. https://s3.example.com or https://minio.example.com
 * @param {string} opts.bucket
 * @param {string} opts.region     e.g. us-east-1; defaults to us-east-1
 * @param {string} opts.accessKeyId
 * @param {string} opts.secretAccessKey
 * @param {string} opts.key        object key inside the bucket (may include /)
 * @param {Buffer} opts.body
 * @param {string} [opts.contentType='application/octet-stream']
 */
export async function uploadToS3(opts) {
  const {
    endpoint: rawEndpoint,
    bucket,
    region = 'us-east-1',
    accessKeyId,
    secretAccessKey,
    key: rawKey,
    body,
    contentType = 'application/octet-stream',
  } = opts

  const endpoint = String(rawEndpoint || '').trim().replace(/\/$/, '')
  if (!endpoint) throw new Error('S3 endpoint is required')
  if (!bucket) throw new Error('S3 bucket is required')
  if (!accessKeyId || !secretAccessKey) throw new Error('S3 credentials are required')

  const key = String(rawKey || '').replace(/^\/+/, '')
  const objectPath = `/${bucket}/${key}`
  const url = `${endpoint}${objectPath}`
  const host = new URL(endpoint).host

  const date = new Date()
  const amzDate = isoDate(date)
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256Hex(body)

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`

  const canonicalRequest = [
    'PUT',
    encodePath(objectPath),
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const dateRegionKey = hmac(dateKey, region)
  const dateRegionServiceKey = hmac(dateRegionKey, 's3')
  const signingKey = hmac(dateRegionServiceKey, 'aws4_request')
  const signature = hmac(signingKey, stringToSign).toString('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, authorization, 'content-type': contentType, 'content-length': String(body.length) },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`S3 upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return { ok: true, status: res.status, etag: res.headers.get('etag') }
}
