// ============================================================
// CVE → wordpress.org slug matching. Pure functions, no database.
//
// Split out so the rules that decide whether a customer is told "your plugin
// is vulnerable" can be tested without a Postgres connection — the matcher is
// the risky part of the ingest, and risky parts should be the easiest to test.
//
// The honest problem this file exists to manage: a CVE describes a product in
// prose ("WP Super Cache plugin before 1.7.2"), while a site reports the slug
// `wp-super-cache`. Bridging that is a guess. A wrong guess puts a red banner
// on a healthy site, so a guess only becomes visible once corroborated.
// ============================================================

/**
 * Pull the wordpress.org slug out of a CVE.
 *
 * Two routes, in order of trust:
 *   1. CPE — structured, and NVD's product field is usually already the slug.
 *   2. Prose — a last resort, and deliberately narrow. It only fires on the
 *      one phrasing that is unambiguous, and everything it produces is marked
 *      unconfirmed regardless.
 */
export function extractTarget(cve) {
  const configs = cve.configurations || []
  for (const conf of configs) {
    for (const node of conf.nodes || []) {
      for (const m of node.cpeMatch || []) {
        // cpe:2.3:a:<vendor>:<product>:<version>:...
        const parts = String(m.criteria || '').split(':')
        const vendor = parts[3]
        const product = parts[4]
        if (!product || product === '*') continue
        // wordpress core itself, not a plugin
        if (product === 'wordpress' && (vendor === 'wordpress' || vendor === 'automattic')) {
          return { slug: 'wordpress', kind: 'core', confident: true }
        }
        return {
          slug: product.replace(/_/g, '-'),
          kind: /theme/i.test(product) ? 'theme' : 'plugin',
          // NVD's product string is usually the slug, but "usually" is not
          // "always", so this still goes through corroboration below.
          confident: true,
        }
      }
    }
  }

  const text = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || ''
  // Only the unambiguous shape: "The <Name> plugin for WordPress".
  const m = text.match(/\bThe\s+(.+?)\s+(plugin|theme)\s+for\s+WordPress\b/i)
  if (m) {
    return {
      slug: m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      kind: m[2].toLowerCase(),
      confident: false,
    }
  }
  return null
}

/** The version the fix landed in — the only field the check actually compares. */
export function extractFixedIn(cve) {
  for (const conf of cve.configurations || []) {
    for (const node of conf.nodes || []) {
      for (const m of node.cpeMatch || []) {
        if (m.versionEndExcluding) return m.versionEndExcluding
      }
    }
  }
  // "before 1.7.2" is the phrasing NVD uses when there is no structured range.
  const text = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || ''
  // Trailing dot excluded: 'before 3.1.' must yield 3.1, not '3.1.'
  const m = text.match(/\bbefore\s+(\d[\w.]*[\w])/i)
  return m ? m[1] : null
}

export function extractSeverity(cve) {
  const metrics = cve.metrics || {}
  const entry =
    metrics.cvssMetricV31?.[0] || metrics.cvssMetricV30?.[0] || metrics.cvssMetricV2?.[0]
  if (!entry) return { severity: null, cvss: null }
  const data = entry.cvssData || {}
  return {
    severity: String(entry.baseSeverity || data.baseSeverity || '').toLowerCase() || null,
    cvss: typeof data.baseScore === 'number' ? data.baseScore : null,
  }
}

/**
 * Does a slug we guessed actually exist in the wordpress.org repository?
 *
 * This is the corroboration step. A CVE naming a product that has no plugin by
 * that slug is almost certainly a bad match, and publishing it would put a
 * scary banner on a site running something unrelated.
 */
const slugCache = new Map()
export async function slugExists(slug, fetchImpl = fetch) {
  if (slug === 'wordpress') return true
  if (slugCache.has(slug)) return slugCache.get(slug)
  let ok = false
  try {
    const res = await fetchImpl(`https://api.wordpress.org/plugins/info/1.0/${slug}.json`, {
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      const body = await res.json()
      ok = Boolean(body && body.slug && !body.error)
    }
  } catch {
    // A network failure is not evidence of absence; leave it unconfirmed
    // rather than either publishing or discarding it.
    ok = false
  }
  slugCache.set(slug, ok)
  return ok
}

/** Turn one NVD record into a row, or null if there is nothing usable in it. */
export async function toRow(item, { verify = slugExists } = {}) {
  const cve = item.cve || item
  const target = extractTarget(cve)
  if (!target) return null

  const { severity, cvss } = extractSeverity(cve)
  const fixedIn = extractFixedIn(cve)
  const summary = (cve.descriptions || []).find((d) => d.lang === 'en')?.value || ''

  // Confirmed means: the structured data pointed at it AND a plugin with that
  // slug really exists. Anything less waits for review.
  const exists = await verify(target.slug)
  const confirmed = Boolean(target.confident && exists && fixedIn)

  return {
    cve_id: cve.id,
    slug: target.slug,
    kind: target.kind,
    fixed_in: fixedIn,
    severity,
    cvss,
    summary: summary.slice(0, 2000),
    published_at: cve.published ? Date.parse(cve.published) : null,
    source: 'nvd',
    confirmed,
    match_note: confirmed
      ? null
      : [
          !target.confident && 'slug guessed from description',
          !exists && 'no such plugin on wordpress.org',
          !fixedIn && 'no fixed version found',
        ]
          .filter(Boolean)
          .join('; '),
  }
}

/**
 * Semver-ish comparison that tolerates the version strings plugins really use.
 *
 * Not a real semver parser on purpose: WordPress plugins ship "2.0", "1.0-beta",
 * "3.1.4.2" and worse. Numeric parts compare numerically so 1.10 sorts above
 * 1.9 — the mistake a plain string compare makes, and the one that would report
 * a patched site as vulnerable.
 */
export function compareVersions(a, b) {
  const norm = (v) => String(v).split(/[.\-+]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p))
  const x = norm(a)
  const y = norm(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0
    const q = y[i] ?? 0
    if (p === q) continue
    if (typeof p === 'number' && typeof q === 'number') return p < q ? -1 : 1
    // A prerelease tag sorts BELOW the release it precedes: 1.0.0-beta < 1.0.0.
    // Missing this reports a beta as newer than the version that fixed the bug,
    // so the site's real vulnerability is never flagged.
    if (typeof p === 'string' && typeof q === 'number') return -1
    if (typeof p === 'number' && typeof q === 'string') return 1
    return String(p) < String(q) ? -1 : 1
  }
  return 0
}
