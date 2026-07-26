// The speed recipe book, tested on the thing that makes it useful: it must
// stay quiet unless a measurement crossed a threshold.
//
// A recommender that fires on every site is noise — people learn to ignore it,
// and then it is worse than nothing when something real shows up.
import test from 'node:test'
import assert from 'node:assert/strict'
import { analyse, RECIPES } from '../src/perf/recipes.js'

/** A site with nothing wrong: everything measured, everything under threshold. */
const healthy = {
  site: {
    autoload: { bytes: 180_000, count: 210, largest: [{ name: 'rewrite_rules', bytes: 40_000, owner: 'wordpress' }] },
    transients: { total: 40, expired: 3 },
    object_cache: { external: true, dropin: true },
    cron: { overdue: 0, disabled: true },
    bloat: { revisions: 120, spam: 0, trash_posts: 2, orphan_meta: 0 },
    php: { version: '8.3.6', memory_limit: '512M', opcache: true },
    plugins_active: 12,
  },
  page: {
    queries: 38, query_ms: 41, generated_ms: 210,
    by_source: [{ source: 'wordpress core', queries: 30, ms: 30 }],
    repeated: [], slow: [],
  },
}

test('a healthy profile produces no findings, and says what that does and does not mean', () => {
  const r = analyse(healthy)
  assert.equal(r.findings.length, 0, 'nothing crossed a threshold, so nothing is reported')
  // The wording matters as much as the count: an empty list is not a clean
  // bill of health, it is the absence of the specific things we measured.
  assert.match(r.summary, /نه اینکه سایت لزوماً سریع است/)
})

test('oversized autoload is caught, and names the rows rather than lecturing', () => {
  const p = structuredClone(healthy)
  p.site.autoload = {
    bytes: 3 * 1024 * 1024,
    count: 900,
    largest: [
      { name: 'some_dead_plugin_cache', bytes: 1_500_000, owner: null },
      { name: 'elementor_stuff', bytes: 400_000, owner: 'elementor' },
      { name: 'tiny', bytes: 900, owner: null },
    ],
  }
  const r = analyse(p)
  const hit = r.findings.find((f) => f.id === 'autoload-oversized')
  assert.ok(hit, 'the most common real slowdown is reported')
  assert.equal(hit.evidence.severity, 'high')
  assert.equal(hit.evidence.offenders.length, 2, 'rows under 50KB are noise, not offenders')

  // And the orphan recipe fires separately, because "delete this" and "change
  // autoload to no" are different actions with different risk.
  assert.ok(r.findings.find((f) => f.id === 'autoload-orphans'))
})

test('an N+1 pattern is only reported when a shape actually repeats', () => {
  const p = structuredClone(healthy)
  p.page.repeated = [{ shape: 'SELECT * FROM wp_postmeta WHERE post_id = ?', count: 6, ms: 12, source: 'plugin: shop' }]
  assert.equal(analyse(p).findings.find((f) => f.id === 'n-plus-one'), undefined, 'six is a pattern, not yet a problem')

  p.page.repeated[0].count = 44
  const hit = analyse(p).findings.find((f) => f.id === 'n-plus-one')
  assert.ok(hit)
  assert.match(hit.steps.join(' '), /plugin: shop/, 'the culprit is named, not just the symptom')
})

test('a plugin is only blamed when it dominates a page that is actually slow', () => {
  const p = structuredClone(healthy)
  // Dominant share, but the page is fast in absolute terms — not worth an alarm.
  p.page.query_ms = 40
  p.page.by_source = [{ source: 'plugin: seo', queries: 20, ms: 35 }]
  assert.equal(analyse(p).findings.find((f) => f.id === 'heavy-plugin'), undefined)

  p.page.query_ms = 800
  p.page.by_source = [
    { source: 'plugin: seo', queries: 300, ms: 600 },
    { source: 'wordpress core', queries: 40, ms: 200 },
  ]
  const hit = analyse(p).findings.find((f) => f.id === 'heavy-plugin')
  assert.ok(hit)
  assert.equal(hit.evidence.share, 75)
})

test('object cache is not pushed at a small site', () => {
  const p = structuredClone(healthy)
  p.site.object_cache = { external: false, dropin: false }
  p.page.queries = 30
  p.site.plugins_active = 8
  assert.equal(analyse(p).findings.find((f) => f.id === 'no-object-cache'), undefined,
    'a small site gains little and adds a moving part')

  p.page.queries = 200
  assert.ok(analyse(p).findings.find((f) => f.id === 'no-object-cache'))
})

test('the only auto-runnable fix is the one that cannot break anything', () => {
  const withAction = RECIPES.filter((r) => r.action)
  assert.deepEqual(withAction.map((r) => r.id), ['expired-transients'])
  assert.equal(withAction[0].risk, 'safe', 'anything with a button must be reversible and invisible')

  // Everything else is advice. A recipe with a risk above safe must never
  // carry an action, or the panel would render a one-click button for it.
  for (const r of RECIPES) {
    if (r.risk !== 'safe') assert.equal(r.action, undefined, `${r.id} must not be one-click`)
  }
})

test('findings are ordered so reversible work comes first', () => {
  const p = structuredClone(healthy)
  p.site.transients = { total: 9000, expired: 4000 }        // safe
  p.site.autoload = { bytes: 2e6, count: 800, largest: [] } // careful
  p.site.php = { version: '7.4.33', opcache: false }        // manual
  const ids = analyse(p).findings.map((f) => f.risk)
  assert.deepEqual([...ids].sort((a, b) => ({ safe: 0, careful: 1, manual: 2 }[a] - { safe: 0, careful: 1, manual: 2 }[b])), ids)
})

test('a missing page profile does not take the site-wide analysis down', () => {
  const p = { site: healthy.site, page_error: 'گزارش صفحه ثبت نشد. معمولاً یعنی صفحه از کش سرو شده' }
  const r = analyse(p)
  assert.equal(r.measured.page, false)
  assert.ok(r.measured.pageNote)
  // Cache-served is reported as the good news it is, not as a failure.
  assert.ok(r.findings.find((f) => f.id === 'page-served-from-cache'))
})

test('a garbage profile yields nothing rather than throwing', () => {
  assert.equal(analyse(null).findings.length, 0)
  assert.equal(analyse({ site: 'nonsense', page: 42 }).findings.length, 0)
})
