// ============================================================
// Where each panel view's data actually comes from.
//
// The panel showed seed data indistinguishable from measurement: "99.98%
// uptime", "24 blocked login attempts", "1.8 GB backup verified". None of it
// was measured, and a customer cannot tell which numbers to trust — so they
// end up trusting none of them, including the ones that are real.
//
// This module makes provenance explicit. Every view declares which fields come
// from the site, and anything without a source is reported as not-yet-built
// rather than filled in with something plausible. A feature that says "not
// measured yet" is honest; the same screen showing an invented number is not.
//
// Language: the prose below is stored as `live.*` translation keys and
// rendered per viewer by provenanceFor(name, locale); tool names stay as-is.
// ============================================================
import { t, hasKey, DEFAULT_LOCALE } from './i18n.js'

/**
 * Provenance for each view.
 *
 *   live    — the connector tools that supply it
 *   missing — what has no source at all, and why
 */
export const PROVENANCE = {
  overview: {
    // site_info from the connector; the rest measured from here with a real
    // HTTP request and a real TLS handshake at the moment the page loads.
    live: ['site_info', 'HTTP probe', 'TLS handshake'],
    partial: {
      uptime: 'live.provenance.overview.uptime',
      responseMs: 'live.provenance.overview.responseMs',
      hostSpace: 'live.provenance.overview.hostSpace',
    },
  },
  updates: {
    live: ['update_status'],
    partial: {},
  },
  security: {
    live: ['core_integrity', 'security_scan', 'live.provenance.security.cveDb'],
    partial: {
      score: 'live.provenance.security.score',
      blockedLogins: 'live.provenance.security.blockedLogins',
    },
  },
  incidents: {
    // Our own event log. Every row is something this system observed on the
    // site or did to it — scans, sensitive actions, policy changes, rescues.
    liveLabel: 'live.provenance.incidents.liveLabel',
    live: ['live.provenance.incidents.eventLog'],
    partial: {
      // Stated because the absence is easy to misread: we see the site when we
      // ask, so an outage between two scans leaves nothing here. This list is
      // an audit trail, not uptime monitoring.
      downtime: 'live.provenance.incidents.downtime',
      logins: 'live.provenance.incidents.logins',
    },
  },
  backups: {
    // Built for real: the connector dumps the database in pure PHP (so it works
    // on hosts with exec() disabled) and records only dumps it verified
    // complete. The panel shows snapshots the site actually holds.
    live: ['backup_list', 'backup_run'],
    partial: {},
  },
}

/** A provenance entry is either a translation key or a literal tool name. */
const render = (locale, v) => (hasKey(v) ? t(locale, v) : v)

/**
 * One view's provenance, rendered for `locale` — what the panel is sent.
 * Unknown views give null.
 */
export function provenanceFor(name, locale = DEFAULT_LOCALE) {
  const p = PROVENANCE[name]
  if (!p) return null
  return {
    ...p,
    ...(p.liveLabel ? { liveLabel: render(locale, p.liveLabel) } : {}),
    live: p.live.map((v) => render(locale, v)),
    partial: Object.fromEntries(Object.entries(p.partial || {}).map(([k, v]) => [k, render(locale, v)])),
  }
}

/**
 * Turn the plugin's update_status into what the panel's updates view expects.
 *
 * Risk is derived from what the update actually is, not invented: a major
 * version jump earns a warning because it can break a site, a patch does not.
 * Nothing here claims an update was "tested on staging" — there is no staging.
 */
export function updatesFromStatus(status, locale = DEFAULT_LOCALE) {
  if (!status || typeof status !== 'object') return null
  const tr = (key) => t(locale, key)
  const risk = (from, to) => {
    const r = riskOf(from, to)
    return { ...r, riskLabel: tr(`live.risk.${r.riskLabel}`) }
  }

  const queue = []

  if (status.core_outdated && status.wp_latest) {
    queue.push({
      id: 'core',
      name: 'WordPress Core',
      kind: 'core',
      from: status.wp_version,
      to: status.wp_latest,
      type: tr('live.type.core'),
      ...risk(status.wp_version, status.wp_latest),
    })
  }
  for (const p of status.plugins_pending || []) {
    queue.push({
      id: `plugin:${p.file || p.name}`,
      name: p.name,
      file: p.file || p.name,
      kind: 'plugin',
      from: p.from,
      to: p.to,
      type: tr('live.type.plugin'),
      ...risk(p.from, p.to),
    })
  }
  for (const th of status.themes_pending || []) {
    queue.push({
      id: `theme:${th.file || th.name}`,
      name: th.name,
      file: th.file || th.name,
      kind: 'theme',
      from: th.from,
      to: th.to,
      type: tr('live.type.theme'),
      ...risk(th.from, th.to),
    })
  }

  return {
    queue,
    // The site reports what is pending, not what it has already installed —
    // WordPress keeps no durable log of that. Claiming a completed list would
    // be inventing history.
    done: [],
    doneNote: tr('live.doneNote'),
    wpVersion: status.wp_version,
    wpLatest: status.wp_latest,
    phpVersion: status.php_version,
    policy: status.policy || null,
    checkedAt: status.checked_at ? status.checked_at * 1000 : null,
  }
}

/**
 * A major version jump can break a site; a patch rarely does. `riskLabel` here
 * is the key suffix under `live.risk`; updatesFromStatus renders it.
 */
function riskOf(from, to) {
  const major = (v) => Number(String(v || '').split('.')[0]) || 0
  const minor = (v) => Number(String(v || '').split('.')[1]) || 0
  if (!from || !to) return { risk: 'low', riskLabel: 'low', authority: 'auto' }
  if (major(to) > major(from)) {
    return { risk: 'high', riskLabel: 'major', authority: 'confirm' }
  }
  if (minor(to) > minor(from)) {
    return { risk: 'medium', riskLabel: 'minor', authority: 'confirm' }
  }
  return { risk: 'low', riskLabel: 'patch', authority: 'auto' }
}
