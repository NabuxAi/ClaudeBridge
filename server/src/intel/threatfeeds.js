// ============================================================
// External threat intelligence — MalwareBazaar and VirusTotal.
//
// Enrichment, never a dependency. Our own bank answers without either of these,
// and both now require keys, so a site must not become unscannable because a
// third party changed its terms.
//
// HASH LOOKUP ONLY. Uploading a customer's file to VirusTotal publishes it —
// their samples are shared with the security industry, and a "suspicious" file
// on a client's site is very often just their own custom code plus a licence
// header. Sending a hash reveals nothing unless the file is already public
// knowledge, which is exactly the case we want to learn about.
//
// Both are queried through us rather than from the site: we absorb the rate
// limits, and no customer's IP is logged against a malware feed.
// ============================================================
import { config } from '../config.js'

const MB = 'https://mb-api.abuse.ch/api/v1/'
const VT = 'https://www.virustotal.com/api/v3/files/'

/** Which feeds are usable right now. The panel says so rather than failing silently. */
export function available() {
  return {
    malwarebazaar: Boolean(config.abuseChKey),
    virustotal: Boolean(config.virusTotalKey),
  }
}

/**
 * Has abuse.ch seen this file?
 *
 * MalwareBazaar is a corpus of confirmed malware, so a hit is a strong signal —
 * it means this exact byte sequence was submitted as a sample by someone.
 */
export async function malwareBazaar(sha256) {
  if (!config.abuseChKey) return { available: false }
  try {
    const res = await fetch(MB, {
      method: 'POST',
      headers: {
        'Auth-Key': config.abuseChKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query: 'get_info', hash: sha256 }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { available: true, error: `HTTP ${res.status}` }
    const body = await res.json()
    if (body.query_status === 'hash_not_found') {
      return { available: true, known: false }
    }
    if (body.query_status !== 'ok') {
      return { available: true, error: body.query_status }
    }
    const d = (body.data || [])[0] || {}
    return {
      available: true,
      known: true,
      family: d.signature || null,
      fileType: d.file_type || null,
      firstSeen: d.first_seen || null,
      tags: d.tags || [],
    }
  } catch (e) {
    return { available: true, error: e.message }
  }
}

/**
 * What do the engines say about this hash?
 *
 * A single detection is not a verdict — engines disagree constantly on PHP, and
 * obfuscated-but-legitimate code trips heuristics all the time. The ratio is
 * returned so the panel can present it as evidence rather than a sentence.
 */
export async function virusTotal(sha256) {
  if (!config.virusTotalKey) return { available: false }
  try {
    const res = await fetch(VT + sha256, {
      headers: { 'x-apikey': config.virusTotalKey },
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 404) return { available: true, known: false }
    if (!res.ok) return { available: true, error: `HTTP ${res.status}` }
    const body = await res.json()
    const stats = body?.data?.attributes?.last_analysis_stats || {}
    const malicious = stats.malicious || 0
    const total = Object.values(stats).reduce((a, b) => a + (b || 0), 0)
    return {
      available: true,
      known: true,
      malicious,
      total,
      // One engine out of seventy is noise; a majority is not. The threshold is
      // stated here rather than left to whoever reads the number.
      confident: malicious >= 5,
      names: Object.entries(body?.data?.attributes?.last_analysis_results || {})
        .filter(([, r]) => r.category === 'malicious')
        .slice(0, 5)
        .map(([engine, r]) => `${engine}: ${r.result}`),
    }
  } catch (e) {
    return { available: true, error: e.message }
  }
}

/**
 * Ask both, in parallel, and fold into one answer.
 *
 * Neither failing may block the other, and neither failing may look like a
 * clean result — "we could not ask" and "we asked and it is clean" are
 * different answers and the caller has to be able to tell them apart.
 */
export async function lookup(sha256) {
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    return { error: 'a sha256 hash is required' }
  }
  const [mb, vt] = await Promise.all([malwareBazaar(sha256), virusTotal(sha256)])
  const known = mb.known === true || vt.known === true
  return {
    sha256,
    known,
    malwarebazaar: mb,
    virustotal: vt,
    verdict: known
      ? 'این فایل در پایگاه‌های بدافزار شناخته‌شده است.'
      : mb.available || vt.available
        ? 'در پایگاه‌های بیرونی شناخته‌شده نیست — که به معنی سالم بودن نیست، فقط یعنی قبلاً گزارش نشده.'
        : 'هیچ منبع بیرونی پیکربندی نشده؛ فقط بانک خودمان بررسی شد.',
  }
}
