// ============================================================
// Where a site is hosted, and what that changes.
//
// This is not a form field for its own sake. Three things depend on it:
//
//   Which of our servers reaches the site. A request from a European address
//   to an Iranian host is slow at best and blocked at worst — sanctions
//   filtering runs in both directions, and a scan that times out looks
//   identical to a site that is down. The egress choice has to be per-site.
//
//   Which address we hand the connector to call back. The plugin posts to a
//   URL we gave it at pairing time; if that host is unreachable from Iran, the
//   site can never report an update run or a scan result. It must be settable
//   per-site and changeable afterwards without re-pairing.
//
//   What we can do at all. Some hosts disable exec(), some cap PHP memory low
//   enough that a large backup dies, some run an aggressive page cache that
//   makes a profiled request never reach PHP. Knowing the provider lets us say
//   that up front instead of failing and blaming the site.
//
// "Other" is a first-class answer. A list of providers is always out of date,
// and a required dropdown with no correct option is how people pick something
// wrong — which is worse than an honest blank, because then we act on it.
//
// Language: labels below are `hosting.*` translation keys; hostingOptions()
// and describe() render them for the viewer's locale.
// ============================================================
import { t, DEFAULT_LOCALE } from './i18n.js'

export const REGIONS = [
  {
    id: 'ir',
    label: 'hosting.regions.ir.label',
    note: 'hosting.regions.ir.note',
  },
  {
    id: 'intl',
    label: 'hosting.regions.intl.label',
    note: 'hosting.regions.intl.note',
  },
  {
    id: 'unknown',
    label: 'hosting.regions.unknown.label',
    note: 'hosting.regions.unknown.note',
  },
]

/**
 * Providers we have actually seen, with the constraints we have actually hit.
 *
 * Every `traits` entry here is a real limitation someone ran into, not a guess
 * from a feature page. An empty traits list means "we have no notes on this
 * host", which is different from "this host has no limits" and is worded that
 * way wherever it surfaces.
 */
export const PROVIDERS = [
  // Iranian
  { id: 'iranserver', label: 'hosting.providers.iranserver', region: 'ir', traits: [] },
  { id: 'parspack', label: 'hosting.providers.parspack', region: 'ir', traits: [] },
  { id: 'mizban', label: 'hosting.providers.mizban', region: 'ir', traits: [] },
  { id: 'hostiran', label: 'hosting.providers.hostiran', region: 'ir', traits: [] },
  { id: 'novin', label: 'hosting.providers.novin', region: 'ir', traits: [] },
  { id: 'iranhost', label: 'hosting.providers.iranhost', region: 'ir', traits: [] },
  { id: 'abrarvan', label: 'hosting.providers.abrarvan', region: 'ir', traits: ['cdn'] },
  { id: 'derak', label: 'hosting.providers.derak', region: 'ir', traits: ['cdn'] },
  // International
  { id: 'hetzner', label: 'Hetzner', region: 'intl', traits: [] },
  { id: 'digitalocean', label: 'DigitalOcean', region: 'intl', traits: [] },
  { id: 'ovh', label: 'OVH', region: 'intl', traits: [] },
  { id: 'contabo', label: 'Contabo', region: 'intl', traits: [] },
  { id: 'cloudways', label: 'Cloudways', region: 'intl', traits: ['page-cache'] },
  { id: 'siteground', label: 'SiteGround', region: 'intl', traits: ['page-cache', 'no-exec'] },
  { id: 'hostinger', label: 'Hostinger', region: 'intl', traits: ['no-exec'] },
  { id: 'godaddy', label: 'GoDaddy', region: 'intl', traits: ['no-exec', 'low-memory'] },
  { id: 'wpengine', label: 'WP Engine', region: 'intl', traits: ['page-cache', 'no-exec', 'readonly-core'] },
  { id: 'kinsta', label: 'Kinsta', region: 'intl', traits: ['page-cache', 'no-exec'] },
  { id: 'cloudflare', label: 'hosting.providers.cloudflare', region: 'intl', traits: ['cdn'] },
  // Always available. Never a dead end.
  { id: 'other', label: 'hosting.providers.other', region: null, traits: [] },
]

/** What each trait means for what we can promise. */
export const TRAITS = {
  'no-exec': {
    label: 'hosting.traits.noExec.label',
    effect: 'hosting.traits.noExec.effect',
  },
  'low-memory': {
    label: 'hosting.traits.lowMemory.label',
    effect: 'hosting.traits.lowMemory.effect',
  },
  'page-cache': {
    label: 'hosting.traits.pageCache.label',
    effect: 'hosting.traits.pageCache.effect',
  },
  'readonly-core': {
    label: 'hosting.traits.readonlyCore.label',
    effect: 'hosting.traits.readonlyCore.effect',
  },
  cdn: {
    label: 'hosting.traits.cdn.label',
    effect: 'hosting.traits.cdn.effect',
  },
}

const byId = new Map(PROVIDERS.map((p) => [p.id, p]))

/**
 * Normalise whatever the form sent into something storable.
 *
 * Unknown values become 'other' plus the free-text note rather than being
 * rejected. A validation error on "which host do you use" teaches people to
 * pick the first option in the list, and then we act on a wrong answer.
 */
export function normalise(input = {}) {
  const region = REGIONS.some((r) => r.id === input.region) ? input.region : 'unknown'
  const known = byId.get(String(input.provider || ''))
  const provider = known ? known.id : 'other'
  const providerName = provider === 'other'
    ? String(input.providerName || '').trim().slice(0, 80) || null
    : null

  return {
    region,
    provider,
    providerName,
    // Which of our servers should reach out to this site. Defaults from the
    // region, but stays overridable: a site can be on an Iranian host and
    // still be reachable internationally, and only trying tells us.
    egress: ['ir', 'intl', 'auto'].includes(input.egress) ? input.egress : 'auto',
    // The address we hand the connector for its callbacks. Null means "use the
    // server default"; setting it lets a site behind a filter reach us on a
    // domain that is not blocked, without re-pairing.
    callbackUrl: normaliseUrl(input.callbackUrl),
  }
}

function normaliseUrl(v) {
  const s = String(v || '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    // http is allowed for an internal address; anything else is a mistake or
    // an attempt to make us speak a protocol we do not speak.
    if (!['http:', 'https:'].includes(u.protocol)) return null
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Provider labels that are keys; brand names written in Latin stay literal. */
const label = (locale, v) => (typeof v === 'string' && v.startsWith('hosting.') ? t(locale, v) : v)

const renderTrait = (locale, id) => ({
  id, label: t(locale, TRAITS[id].label), effect: t(locale, TRAITS[id].effect),
})

/** The form's choices, rendered for `locale` (GET /hosting/options). */
export function hostingOptions(locale = DEFAULT_LOCALE) {
  return {
    regions: REGIONS.map((r) => ({ ...r, label: t(locale, r.label), note: t(locale, r.note) })),
    providers: PROVIDERS.map((p) => ({ ...p, label: label(locale, p.label) })),
    traits: Object.fromEntries(Object.keys(TRAITS).map((id) => {
      const { label: l, effect } = renderTrait(locale, id)
      return [id, { label: l, effect }]
    })),
  }
}

/** Everything the panel needs to explain a stored profile, in `locale`. */
export function describe(profile, locale = DEFAULT_LOCALE) {
  const p = normalise(profile || {})
  const known = byId.get(p.provider)
  const traits = (known?.traits || []).map((id) => renderTrait(locale, id))

  return {
    ...p,
    regionLabel: label(locale, REGIONS.find((r) => r.id === p.region)?.label) || null,
    providerLabel: p.provider === 'other' ? (p.providerName || t(locale, 'hosting.unnamed')) : label(locale, known?.label) || null,
    traits,
    // Said explicitly, because "no known limitations" and "we have no notes on
    // this host" look identical in a UI that just renders an empty list.
    traitsNote: known && known.id !== 'other' && traits.length === 0
      ? t(locale, 'hosting.notes.noKnownLimits')
      : p.provider === 'other'
        ? t(locale, 'hosting.notes.notListed')
        : null,
  }
}

/**
 * Which egress to use for a site.
 *
 * 'auto' follows the region; anything else is an explicit override the owner
 * or we set after seeing what actually worked.
 */
export function egressFor(profile) {
  const p = normalise(profile || {})
  if (p.egress !== 'auto') return p.egress
  return p.region === 'ir' ? 'ir' : 'intl'
}

/**
 * Does this host need cache-busting on health checks?
 *
 * A cached 200 for a page that is actually broken is the worst possible answer
 * from a health check, so where a CDN or server cache is in front we always
 * add a unique parameter.
 */
export function needsCacheBust(profile) {
  const known = byId.get(normalise(profile || {}).provider)
  return Boolean(known?.traits?.some((t) => t === 'cdn' || t === 'page-cache'))
}
