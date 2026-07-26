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
// ============================================================

export const REGIONS = [
  {
    id: 'ir',
    label: 'ایران',
    note: 'درخواست‌ها از سرور داخلی ما فرستاده می‌شود و آدرس بازگشتی هم داخلی است.',
  },
  {
    id: 'intl',
    label: 'خارج از ایران',
    note: 'درخواست‌ها از سرور بین‌المللی ما فرستاده می‌شود.',
  },
  {
    id: 'unknown',
    label: 'نمی‌دانم',
    note: 'با تنظیمات پیش‌فرض کار می‌کنیم. اگر بررسی‌ها کند بود یا به سایت نرسید، این را مشخص کنید.',
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
  { id: 'iranserver', label: 'ایران سرور', region: 'ir', traits: [] },
  { id: 'parspack', label: 'پارس‌پک', region: 'ir', traits: [] },
  { id: 'mizban', label: 'میزبان فا', region: 'ir', traits: [] },
  { id: 'hostiran', label: 'هاست ایران', region: 'ir', traits: [] },
  { id: 'novin', label: 'نوین‌هاست', region: 'ir', traits: [] },
  { id: 'iranhost', label: 'ایران‌هاست', region: 'ir', traits: [] },
  { id: 'abrarvan', label: 'ابر آروان', region: 'ir', traits: ['cdn'] },
  { id: 'derak', label: 'درک‌کلود', region: 'ir', traits: ['cdn'] },
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
  { id: 'cloudflare', label: 'پشت Cloudflare', region: 'intl', traits: ['cdn'] },
  // Always available. Never a dead end.
  { id: 'other', label: 'موردی غیر از این‌ها', region: null, traits: [] },
]

/** What each trait means for what we can promise. */
export const TRAITS = {
  'no-exec': {
    label: 'exec() بسته است',
    effect: 'بکاپ با mysqldump کار نمی‌کند؛ از مسیر PHP خالص استفاده می‌کنیم که کندتر است ولی همه‌جا کار می‌کند.',
  },
  'low-memory': {
    label: 'حافظهٔ PHP کم',
    effect: 'بکاپ فایل‌ها و اسکن کامل ممکن است نیمه‌کاره بماند. کارها را ریزتر تکه می‌کنیم.',
  },
  'page-cache': {
    label: 'کش صفحه در سطح سرور',
    effect: 'بررسی سرعت ممکن است به PHP نرسد و کوئری‌ای برای شمردن نباشد — که خودش خبر خوبی است، ولی گزارش خالی می‌شود.',
  },
  'readonly-core': {
    label: 'فایل‌های هسته فقط‌خواندنی',
    effect: 'به‌روزرسانی هسته از پنل ما انجام نمی‌شود؛ خود هاست آن را مدیریت می‌کند.',
  },
  cdn: {
    label: 'CDN جلوی سایت',
    effect: 'بررسی سلامت و تداخل ممکن است پاسخ کش‌شده بگیرد. برای همین به آدرس‌ها پارامتر یکتا اضافه می‌کنیم.',
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

/** Everything the panel needs to explain a stored profile. */
export function describe(profile) {
  const p = normalise(profile || {})
  const known = byId.get(p.provider)
  const traits = (known?.traits || []).map((t) => ({ id: t, ...TRAITS[t] }))

  return {
    ...p,
    regionLabel: REGIONS.find((r) => r.id === p.region)?.label || null,
    providerLabel: p.provider === 'other' ? (p.providerName || 'نامشخص') : known?.label || null,
    traits,
    // Said explicitly, because "no known limitations" and "we have no notes on
    // this host" look identical in a UI that just renders an empty list.
    traitsNote: known && known.id !== 'other' && traits.length === 0
      ? 'برای این هاست محدودیت شناخته‌شده‌ای ثبت نکرده‌ایم — یعنی چیزی ندیده‌ایم، نه اینکه قطعاً محدودیتی نیست.'
      : p.provider === 'other'
        ? 'این هاست در فهرست ما نیست، پس رفتار خاصی برایش تنظیم نشده.'
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
