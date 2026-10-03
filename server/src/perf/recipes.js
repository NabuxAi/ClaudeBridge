// ============================================================
// The speed recipe book.
//
// Every entry is a condition, a reason, and a fix. Nothing here fires on a
// hunch: a recipe only appears when the measurement it depends on came back
// and crossed its threshold, so a site never gets told to "install a cache
// plugin" because that is generic advice — it gets told which query ran
// eleven times and which plugin issued it.
//
// Three fields decide what the panel is allowed to do with a recipe:
//
//   `when`   reads the profile and returns null (not applicable) or the
//            evidence. Evidence, not a boolean — the panel shows the number
//            that triggered it, so the owner can disagree with us.
//   `risk`   'safe'    reversible, no visible change. May be offered as a
//                      one-click action.
//            'careful' reversible but changes behaviour someone may depend on.
//            'manual'  needs a decision or hosting access we do not have.
//   `action` the connector op, when one exists. Recipes with no action are
//            still worth showing — knowing the cause is most of the value —
//            but they must never render as a button.
//
// The ordering rule that matters: autoload first. It is the most common real
// slowdown on a WordPress site and the least diagnosed, because it taxes every
// single request — admin-ajax, REST, cron, and every page — rather than
// showing up on the one page someone happened to test.
//
// Language: this file holds no prose. Titles, reasons and steps are
// translation keys under the `perf` namespace; analyse() renders them with
// the translator its caller passes (`{ t: (key, vars) => string }`). The
// server passes its i18n t bound to the request locale; the hub copy passes
// its own. Without a translator the keys come back as-is.
// ============================================================

const KB = 1024
const MB = 1024 * KB

/** One rendered line of a fix: a key plus its variables. */
const step = (key, vars) => ({ key, vars })

export const RECIPES = [
  {
    id: 'autoload-oversized',
    // The "why" names the part people get wrong: it is not one slow page, it
    // is a tax on literally every request the site serves.
    risk: 'careful',
    when: (p) => {
      const a = p?.site?.autoload
      if (!a || typeof a.bytes !== 'number') return null
      if (a.bytes <= 512 * KB) return null
      return {
        bytes: a.bytes,
        count: a.count,
        severity: a.bytes > MB ? 'high' : 'medium',
        // The actionable half: which rows, and who owns them.
        offenders: (a.largest || []).filter((o) => o.bytes > 50 * KB).slice(0, 8),
      }
    },
    fix: (ev) => {
      const orphans = ev.offenders.filter((o) => !o.owner)
      const lines = [
        step('perf.steps.autoloadOversized.total', { size: size(ev.bytes), count: ev.count }),
        step('perf.steps.autoloadOversized.intro'),
        step('perf.steps.autoloadOversized.removed'),
        step('perf.steps.autoloadOversized.active'),
        step('perf.steps.autoloadOversized.cache'),
      ]
      if (orphans.length) lines.push(step('perf.steps.autoloadOversized.orphans', { count: orphans.length }))
      return lines
    },
  },

  {
    id: 'autoload-orphans',
    risk: 'careful',
    when: (p) => {
      const large = (p?.site?.autoload?.largest || []).filter((o) => !o.owner && o.bytes > 20 * KB)
      if (!large.length) return null
      return { rows: large, bytes: large.reduce((a, o) => a + o.bytes, 0) }
    },
    fix: (ev) => [
      step('perf.steps.autoloadOrphans.total', { count: ev.rows.length, size: size(ev.bytes) }),
      step('perf.steps.autoloadOrphans.backup'),
      step('perf.steps.autoloadOrphans.unsure'),
    ],
  },

  {
    id: 'no-object-cache',
    risk: 'manual',
    when: (p) => {
      const oc = p?.site?.object_cache
      if (!oc || oc.external) return null
      // Only worth raising when there is enough traffic-shaped work to benefit:
      // a small brochure site gains little and adds a moving part.
      const queries = p?.page?.queries || 0
      const plugins = p?.site?.plugins_active || 0
      if (queries < 80 && plugins < 20) return null
      return { queries, plugins }
    },
    fix: () => [
      step('perf.steps.noObjectCache.install'),
      step('perf.steps.noObjectCache.needsRedis'),
      step('perf.steps.noObjectCache.shared'),
    ],
  },

  {
    id: 'n-plus-one',
    risk: 'manual',
    when: (p) => {
      const worst = (p?.page?.repeated || []).filter((r) => r.count >= 10)
      if (!worst.length) return null
      return { worst: worst.slice(0, 5) }
    },
    fix: (ev) => {
      const top = ev.worst[0]
      return [
        step('perf.steps.nPlusOne.worst', { count: top.count, ms: Math.round(top.ms) }),
        top.source ? step('perf.steps.nPlusOne.source', { source: top.source }) : step('perf.steps.nPlusOne.noSource'),
        step('perf.steps.nPlusOne.owner'),
        step('perf.steps.nPlusOne.thirdParty'),
      ]
    },
  },

  {
    id: 'heavy-plugin',
    risk: 'manual',
    when: (p) => {
      const sources = p?.page?.by_source || []
      const total = p?.page?.query_ms || 0
      if (!sources.length || total < 100) return null
      const top = sources.find((s) => s.source.startsWith('plugin:'))
      if (!top) return null
      const share = top.ms / total
      if (share < 0.35) return null
      return { source: top.source, ms: top.ms, queries: top.queries, share: Math.round(share * 100) }
    },
    fix: (ev) => [
      step('perf.steps.heavyPlugin.share', { source: ev.source, share: ev.share, queries: ev.queries, ms: Math.round(ev.ms) }),
      step('perf.steps.heavyPlugin.settings'),
      step('perf.steps.heavyPlugin.conflict'),
    ],
  },

  {
    id: 'slow-query',
    risk: 'manual',
    when: (p) => {
      const slow = p?.page?.slow || []
      if (!slow.length) return null
      return { slow: slow.slice(0, 5) }
    },
    fix: (ev) => [
      step('perf.steps.slowQuery.slowest', { ms: Math.round(ev.slow[0].ms), source: ev.slow[0].source }),
      step('perf.steps.slowQuery.postmeta'),
      step('perf.steps.slowQuery.cleanup'),
    ],
  },

  {
    id: 'expired-transients',
    risk: 'safe',
    action: 'perf_clean_transients',
    when: (p) => {
      const t = p?.site?.transients
      if (!t || t.expired < 200) return null
      return { expired: t.expired, total: t.total }
    },
    fix: (ev) => [
      step('perf.steps.expiredTransients.count', { count: ev.expired }),
      step('perf.steps.expiredTransients.safe'),
    ],
  },

  {
    id: 'revision-bloat',
    risk: 'careful',
    when: (p) => {
      const b = p?.site?.bloat
      if (!b || b.revisions < 5000) return null
      return { revisions: b.revisions, trash: b.trash_posts, spam: b.spam, orphanMeta: b.orphan_meta }
    },
    fix: (ev) => [
      step('perf.steps.revisionBloat.count', { count: ev.revisions }),
      step('perf.steps.revisionBloat.limit'),
      step('perf.steps.revisionBloat.irreversible'),
      ev.orphanMeta > 1000 ? step('perf.steps.revisionBloat.orphanMeta', { count: ev.orphanMeta }) : null,
    ].filter(Boolean),
  },

  {
    id: 'cron-backlog',
    risk: 'manual',
    when: (p) => {
      const c = p?.site?.cron
      if (!c || c.overdue < 10) return null
      return { overdue: c.overdue, disabled: c.disabled }
    },
    fix: (ev) => [
      step('perf.steps.cronBacklog.overdue', { count: ev.overdue }),
      ev.disabled ? step('perf.steps.cronBacklog.disabled') : step('perf.steps.cronBacklog.enable'),
      step('perf.steps.cronBacklog.relief'),
    ],
  },

  {
    id: 'old-php',
    risk: 'manual',
    when: (p) => {
      const v = p?.site?.php?.version
      if (!v) return null
      const major = parseFloat(v)
      if (!(major < 8.1)) return null
      return { version: v }
    },
    fix: (ev) => [
      step('perf.steps.oldPhp.version', { version: ev.version }),
      step('perf.steps.oldPhp.upgrade'),
      step('perf.steps.oldPhp.backup'),
    ],
  },

  {
    id: 'no-opcache',
    risk: 'manual',
    when: (p) => (p?.site?.php && p.site.php.opcache === false ? { off: true } : null),
    fix: () => [
      step('perf.steps.noOpcache.enable'),
      step('perf.steps.noOpcache.askHost'),
    ],
  },

  {
    id: 'page-served-from-cache',
    risk: 'safe',
    // Structured, not worded: the plugin sets http_code beside page_error only
    // when the page answered but never stored a PHP report — the served-from-
    // cache case. A page that failed to load carries page_error alone.
    when: (p) => (p?.page_error && !p.page && p.http_code != null ? { cached: true } : null),
    fix: () => [
      step('perf.steps.pageCached.nothing'),
      step('perf.steps.pageCached.bypass'),
    ],
  },
]

/** A byte count as a rendered size line ("3.0 MB"), as a step variable. */
const size = (bytes) => (bytes >= MB
  ? { key: 'perf.size.mb', vars: { n: Number((bytes / MB).toFixed(1)) } }
  : { key: 'perf.size.kb', vars: { n: Math.round(bytes / KB) } })

const keyOnly = (key) => key

/** Render one step: nested `{key, vars}` values (sizes) are rendered first. */
function render(tr, s) {
  const vars = {}
  for (const [k, v] of Object.entries(s.vars || {})) {
    vars[k] = v && typeof v === 'object' && v.key ? tr(v.key, v.vars) : v
  }
  return tr(s.key, vars)
}

/**
 * Match a profile against the book.
 *
 * Returns only what the measurements support, each with the evidence that
 * triggered it. Sorted by risk so the reversible things come first — the order
 * someone should actually work in.
 *
 * `opts.t` renders the `perf.*` keys; see the header.
 */
export function analyse(profile, opts = {}) {
  const tr = typeof opts.t === 'function' ? opts.t : keyOnly
  const order = { safe: 0, careful: 1, manual: 2 }
  const found = []

  for (const r of RECIPES) {
    let evidence
    try {
      evidence = r.when(profile)
    } catch {
      // A malformed profile must not take the whole analysis down; a recipe
      // that cannot read its input simply does not apply.
      continue
    }
    if (!evidence) continue
    found.push({
      id: r.id,
      title: tr(`perf.recipes.${r.id}.title`),
      why: tr(`perf.recipes.${r.id}.why`),
      risk: r.risk,
      action: r.action || null,
      evidence,
      steps: r.fix(evidence).map((s) => render(tr, s)),
    })
  }

  found.sort((a, b) => order[a.risk] - order[b.risk])
  return {
    findings: found,
    // Stated so an empty result cannot be read as "your site is fast". It
    // means nothing crossed a threshold in what we measured.
    summary: found.length
      ? tr('perf.summary.found', { count: found.length })
      : tr('perf.summary.none'),
    measured: {
      site: Boolean(profile?.site),
      page: Boolean(profile?.page),
      pageNote: profile?.page_error || null,
    },
  }
}
