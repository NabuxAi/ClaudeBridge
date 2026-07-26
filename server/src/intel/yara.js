// ============================================================
// YARA → our signature bank.
//
// PHP has no YARA engine on any shared host worth naming, so rules are parsed
// here and shipped to sites as plain strings the connector can match itself.
//
// The part that must not be lost in translation is the CONDITION. Many webshell
// rules match on short base64 fragments — "ZXhlY" is just base64 for "exec" —
// which mean nothing alone and occur constantly in ordinary encoded data. YARA
// only fires when several hit at once ("2 of them"). Flatten that into
// independent signatures and a precise rule becomes a false-positive generator
// that trains people to ignore the scanner.
//
// So each rule keeps its strings grouped and carries a minimum hit count, and
// the matcher on the site side honours it.
//
// Rules are licensed under Detection Rule License 1.1: free to use and
// redistribute with attribution, not to be sold as a signature product. The
// author, licence and source are stored per rule so attribution survives.
// ============================================================

/**
 * Extract rules from a .yar file.
 *
 * Deliberately not a full YARA parser — that would be a project. It reads the
 * subset these rule sets actually use: plain string literals, the modifiers
 * that change matching, and enough of the condition to recover a threshold.
 */
/**
 * Rules for languages this scanner will never encounter.
 *
 * A WordPress site serves PHP. ASP and JSP webshell rules cannot fire
 * legitimately here, but they can fire accidentally — all ten of the first
 * false positives came from JSP and ASP rules triggering on the single word
 * "request", which appears in ordinary code everywhere.
 */
const IRRELEVANT = /(^|_)(ASP|ASPX|JSP|JSPX|CSHARP|PERL|PY|PYTHON|SH|CFM)(_|$)/i

export function parseRules(text, { source = 'signature-base', phpOnly = true } = {}) {
  const rules = []
  // Rule bodies, tolerating tags after the name (`rule NAME : FILE {`).
  const re = /^rule\s+([A-Za-z0-9_]+)\s*(?::[^\{]*)?\{([\s\S]*?)^\}/gm
  let m
  while ((m = re.exec(text))) {
    const [, name, body] = m
    if (phpOnly && IRRELEVANT.test(name)) continue
    const rule = parseRule(name, body, source)
    if (!rule || !rule.strings.length) continue
    // A rule with many strings but a threshold of one means the condition was
    // not modelled correctly. Rather than ship a guess that fires on a single
    // common word, drop it and say so — a missing rule is recoverable, a rule
    // that accuses healthy sites is not.
    if (rule.strings.length > 8 && rule.min_hits === 1) continue
    rules.push(rule)
  }
  return rules
}

function parseRule(name, body, source) {
  const meta = {}
  const metaBlock = body.match(/meta:\s*([\s\S]*?)(?=strings:|condition:|$)/)
  if (metaBlock) {
    for (const line of metaBlock[1].split('\n')) {
      // Values are quoted strings OR bare numbers/booleans — `score = 75` has
      // no quotes. Reading only the quoted form silently dropped every score,
      // which downgraded every rule to "suspicious" and would have reported
      // confirmed webshells at the severity people learn to ignore.
      const kv = line.match(/^\s*([a-z_]+)\s*=\s*(?:"([^"]*)"|([\w.\-]+))\s*$/i)
      // hash appears many times; only the first of any key is kept.
      if (kv && !(kv[1] in meta)) meta[kv[1]] = kv[2] !== undefined ? kv[2] : kv[3]
    }
  }

  const strings = []
  const stringsBlock = body.match(/strings:\s*([\s\S]*?)(?=condition:|$)/)
  if (stringsBlock) {
    for (const line of stringsBlock[1].split('\n')) {
      // $name = "literal" modifiers…   — hex and regex strings are skipped,
      // because the site-side matcher does plain substring matching and a
      // half-translated regex is worse than no rule.
      const s = line.match(/^\s*\$[A-Za-z0-9_]*\s*=\s*"((?:[^"\\]|\\.)*)"(.*)$/)
      if (!s) continue
      const value = unescapeYara(s[1])
      const mods = s[2] || ''
      // Very short strings match everything. Two characters of base64 is not a
      // signature, it is noise.
      if (value.length < 5) continue
      strings.push({ value, nocase: /\bnocase\b/.test(mods) })
    }
  }

  return {
    name,
    family: meta.description ? meta.description.slice(0, 120) : name,
    description: meta.description || '',
    author: meta.author || '',
    license: meta.license || '',
    source,
    // score is signature-base's own confidence, 0-100.
    severity: Number(meta.score) >= 70 ? 'critical' : 'suspicious',
    min_hits: minHits(body, strings.length),
    strings,
  }
}

/**
 * Recover "how many strings must match" from the condition.
 *
 * Only the shapes these rule sets actually use are handled. Anything else falls
 * back to requiring ALL strings, which is the conservative direction: a rule
 * that under-fires is a missed detection, a rule that over-fires is a false
 * accusation on someone's live site.
 */
export function minHits(body, total) {
  const cond = (body.match(/condition:\s*([\s\S]*)$/) || [, ''])[1]
  if (!cond.trim()) return Math.max(1, total)

  if (/\ball\s+of\s+them\b/.test(cond)) return Math.max(1, total)
  if (/\bany\s+of\s+them\b/.test(cond)) return 1

  const n = cond.match(/\b(\d+)\s+of\s+them\b/)
  if (n) return Math.max(1, Math.min(Number(n[1]), total))

  // "1 of ($ext*) and 2 of ($susp*)" — several subset clauses ANDed together.
  // Taking only the first number was the bug that gave a 43-string rule a
  // threshold of 1, so it fired on any file containing the word "request".
  // Every ANDed clause must be satisfied, so the counts add up.
  const subsets = [...cond.matchAll(/\b(\d+)\s+of\s+\(/g)].map((x) => Number(x[1]))
  if (subsets.length) {
    const sum = /\bor\b/.test(cond)
      ? Math.min(...subsets)   // alternatives: the cheapest one can satisfy it
      : subsets.reduce((a, b) => a + b, 0)
    return Math.max(1, Math.min(sum, total))
  }

  // A single `$x` reference, or a condition we do not model.
  return Math.max(1, total)
}

function unescapeYara(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/**
 * Would this rule fire on the given text?
 *
 * The same logic the connector runs, kept here so the pack can be tested
 * server-side against known-good and known-bad samples before it ships.
 */
export function ruleMatches(rule, text) {
  let hits = 0
  const hay = text
  const lower = text.toLowerCase()
  for (const s of rule.strings) {
    const found = s.nocase ? lower.includes(s.value.toLowerCase()) : hay.includes(s.value)
    if (found && ++hits >= rule.min_hits) return true
  }
  return false
}
