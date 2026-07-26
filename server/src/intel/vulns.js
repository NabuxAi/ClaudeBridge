// ============================================================
// Matching a site's installed software against the CVE database.
//
// The ingest built 7,998 rows and nothing read them — the matcher in match.js
// had no caller at all. This is the half that turns a table into an answer:
// what is installed here, and is any of it below the version that fixed a
// known vulnerability.
//
// The comparison is the delicate part and lives in match.js, tested there. Two
// properties matter and are easy to get wrong:
//
//   A prerelease sorts BELOW its release. A site on 1.0.0-beta is behind
//   1.0.0, so if the fix landed in 1.0.0 that site is vulnerable. Sorting it
//   above — the naive string comparison — hides a real vulnerability on the
//   sites most likely to have one.
//
//   No `fixed_in` means we cannot say. A CVE whose advisory never named a
//   fixed version cannot be matched against an installed version, so it is
//   reported as "affects this plugin, version unknown" rather than silently
//   dropped or silently counted as a hit.
// ============================================================
import { all } from '../db.js'
import { compareVersions, slugOf } from './match.js'

// Re-exported so callers have one import for "the vulnerability feature".
export { slugOf }

/**
 * Everything we hold about the slugs a site actually has installed.
 *
 * `confirmed = true` is not optional. A CVE names its product in prose — "WP
 * Super Cache plugin before 1.7.2 for WordPress" — while a site reports the
 * slug `wp-super-cache`, and getting from one to the other is a guess. The
 * ingest only marks a row confirmed once it has corroborated the slug against
 * wordpress.org; of the 7,998 rows currently stored, 5,743 are unconfirmed
 * guesses. Showing those would mean telling people their healthy plugin is
 * vulnerable. Under-reporting is recoverable; crying wolf is not.
 */
async function knownFor(slugs) {
  if (!slugs.length) return []
  return all(
    `SELECT cve_id, slug, kind, fixed_in, severity, cvss, summary, published_at
       FROM vulnerabilities
      WHERE slug = ANY($1) AND confirmed = true
      ORDER BY published_at DESC NULLS LAST`,
    [slugs]
  )
}

/**
 * Check an inventory against the database.
 *
 * `inventory` is what the site reported: [{ slug, version, kind, name, active }].
 * Nothing is fetched from the site here — the caller owns that — so this stays
 * a pure database question and can be tested without a WordPress install.
 */
export async function checkInventory(inventory = []) {
  const items = inventory.filter((i) => i && i.slug)
  const rows = await knownFor([...new Set(items.map((i) => i.slug))])

  const bySlug = new Map()
  for (const r of rows) {
    if (!bySlug.has(r.slug)) bySlug.set(r.slug, [])
    bySlug.get(r.slug).push(r)
  }

  const vulnerable = []
  const unknownVersion = []

  for (const item of items) {
    for (const cve of bySlug.get(item.slug) || []) {
      if (cve.kind && item.kind && cve.kind !== item.kind) continue

      if (!cve.fixed_in) {
        // Honest third category. Reporting these as safe would be a lie and
        // reporting them as hits would bury the real ones in noise.
        unknownVersion.push({ ...describe(cve, item), why: 'نسخهٔ اصلاح‌شده در گزارش اصلی ذکر نشده' })
        continue
      }
      if (!item.version) {
        unknownVersion.push({ ...describe(cve, item), why: 'نسخهٔ نصب‌شده خوانده نشد' })
        continue
      }
      if (compareVersions(item.version, cve.fixed_in) < 0) {
        vulnerable.push(describe(cve, item))
      }
    }
  }

  const rank = { critical: 0, high: 1, medium: 2, low: 3 }
  vulnerable.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))

  return {
    checked: items.length,
    vulnerable,
    unknownVersion,
    // Said explicitly, because an empty result is the one people over-read.
    // Our database is a keyword walk of NVD; plenty of WordPress plugin
    // vulnerabilities are only ever published in vendor advisories.
    note:
      'این بررسی روی پایگاه CVE خودمان انجام می‌شود که از NVD ساخته شده، و فقط مواردی گزارش می‌شود که ' +
      'اسلاگشان با مخزن وردپرس تطبیق داده شده. خالی بودن نتیجه یعنی در این پایگاه چیز تأییدشده‌ای نبود، ' +
      'نه اینکه افزونه‌ها قطعاً امن‌اند.',
  }
}

function describe(cve, item) {
  return {
    cve: cve.cve_id,
    slug: item.slug,
    name: item.name || item.slug,
    kind: item.kind || cve.kind,
    installed: item.version || null,
    fixedIn: cve.fixed_in || null,
    severity: (cve.severity || '').toLowerCase() || null,
    cvss: cve.cvss != null ? Number(cve.cvss) : null,
    summary: cve.summary || null,
    published: cve.published_at ? Number(cve.published_at) : null,
    active: Boolean(item.active),
    // The action, spelled out rather than left implied. An inactive plugin
    // with a known hole is still a file on disk that can be reached directly,
    // so "deactivate it" is not the fix — updating or deleting it is.
    advice: cve.fixed_in
      ? `به نسخهٔ ${cve.fixed_in} یا بالاتر به‌روزرسانی کنید.`
      : 'نسخهٔ اصلاح‌شده مشخص نیست؛ سایت سازنده را بررسی کنید.',
  }
}
