// ============================================================
// Signature bank — ingest YARA rules, serve them as a pack sites can use.
//
// Sites never fetch from GitHub themselves. Everything comes from here, so we
// absorb the rate limits, no customer's IP is logged against a security feed,
// and a site that is offline at refresh time is not left on stale rules
// forever.
// ============================================================
import { one, all, query } from '../db.js'
import { parseRules } from './yara.js'

// Only the rule files worth shipping to a PHP site. The full repo carries
// hundreds of files for malware families a WordPress install will never meet,
// and every irrelevant rule is a chance to be wrong on someone's live site.
const SOURCES = [
  'https://raw.githubusercontent.com/Neo23x0/signature-base/master/yara/gen_webshells.yar',
  'https://raw.githubusercontent.com/Neo23x0/signature-base/master/yara/gen_php_webshells.yar',
  'https://raw.githubusercontent.com/Neo23x0/signature-base/master/yara/gen_cn_webshells.yar',
]

export async function ingest({ log = console.log } = {}) {
  const started = Date.now()
  const run = await one(
    'INSERT INTO intel_runs (feed, started_at) VALUES ($1,$2) RETURNING id',
    ['signatures', started]
  )
  let added = 0
  let updated = 0
  let error = null

  try {
    for (const url of SOURCES) {
      let text
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
        if (!res.ok) {
          // A single missing file must not abandon the whole refresh — the repo
          // renames files occasionally.
          log(`  skip ${url.split('/').pop()}: HTTP ${res.status}`)
          continue
        }
        text = await res.text()
      } catch (e) {
        log(`  skip ${url.split('/').pop()}: ${e.message}`)
        continue
      }

      const rules = parseRules(text)
      log(`  ${url.split('/').pop()}: ${rules.length} usable rules`)

      for (const rule of rules) {
        const existing = await one('SELECT id FROM signature_rules WHERE name = $1', [rule.name])
        let ruleId
        if (existing) {
          await query(
            `UPDATE signature_rules SET family=$2, severity=$3, min_hits=$4,
                    description=$5, author=$6, license=$7 WHERE id=$1`,
            [existing.id, rule.family, rule.severity, rule.min_hits, rule.description, rule.author, rule.license]
          )
          ruleId = existing.id
          updated++
          // Replace the strings wholesale: a rule that lost a string upstream
          // must lose it here too, or its threshold silently becomes easier.
          await query('DELETE FROM signatures WHERE rule_id = $1', [ruleId])
        } else {
          const row = await one(
            `INSERT INTO signature_rules
               (name, family, severity, min_hits, description, author, license, source, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [rule.name, rule.family, rule.severity, rule.min_hits, rule.description,
             rule.author, rule.license, rule.source, Date.now()]
          )
          ruleId = row.id
          added++
        }

        for (const s of rule.strings) {
          await query(
            `INSERT INTO signatures (pattern, kind, severity, family, source, nocase, rule_id, first_seen)
             VALUES ($1,'literal',$2,$3,$4,$5,$6,$7)
             ON CONFLICT (pattern, kind) DO UPDATE SET rule_id = EXCLUDED.rule_id`,
            [s.value, rule.severity, rule.family, rule.source, s.nocase, ruleId, Date.now()]
          )
        }
      }
    }
  } catch (e) {
    error = e.message
  }

  await query(
    'UPDATE intel_runs SET finished_at=$2, added=$3, updated=$4, error=$5 WHERE id=$1',
    [run.id, Date.now(), added, updated, error]
  )
  return { added, updated, error }
}

/**
 * The pack a site downloads: rules with their strings and thresholds.
 *
 * Sent whole rather than as a flat string list, because the threshold is what
 * keeps a rule precise. A site that receives only the strings would fire on any
 * one of them and report healthy files as infected.
 */
export async function pack() {
  const rules = await all(
    `SELECT r.id, r.name, r.family, r.severity, r.min_hits, r.author, r.license
       FROM signature_rules r WHERE r.enabled ORDER BY r.name`
  )
  const strings = await all(
    'SELECT rule_id, pattern, nocase FROM signatures WHERE rule_id IS NOT NULL AND enabled'
  )
  const byRule = new Map()
  for (const s of strings) {
    if (!byRule.has(s.rule_id)) byRule.set(s.rule_id, [])
    byRule.get(s.rule_id).push({ v: s.pattern, i: s.nocase })
  }

  const out = rules
    .map((r) => ({
      name: r.name,
      family: r.family,
      severity: r.severity,
      min_hits: r.min_hits,
      strings: byRule.get(r.id) || [],
    }))
    .filter((r) => r.strings.length > 0)

  const last = await one(
    "SELECT finished_at FROM intel_runs WHERE feed='signatures' AND error IS NULL ORDER BY finished_at DESC NULLS LAST LIMIT 1"
  )

  return {
    version: 1,
    updated_at: last?.finished_at || null,
    rules: out,
    // Detection Rule License 1.1 permits use and redistribution with credit.
    // The attribution travels with the pack rather than living only in a
    // comment nobody downstream can see.
    attribution: 'Rules from Neo23x0/signature-base, Detection Rule License 1.1.',
  }
}
