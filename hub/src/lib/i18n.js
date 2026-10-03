// ============================================================
// Hub i18n — one small module, no dependency.
//
// Strings live in src/locales/<lang>/<namespace>.json. A key is
// "<namespace>.<path>" — `t('login.title')` reads `title` from
// src/locales/<lang>/login.json. English is the default and the
// fallback: it is bundled eagerly, every other language is loaded on
// demand, and a key missing from the active language falls back to
// English (then to the key itself, so a gap is visible, not blank).
//
// The active language is module state. Switching it remounts the app
// (I18nProvider keys its subtree on the language), so plain `t()` calls
// inside render are always current. Never call `t()` at module top level:
// that runs once at import, in whatever language was active then.
// ============================================================

export const LANGS = [
  { code: 'en', name: 'English', dir: 'ltr', intl: 'en-US' },
  { code: 'fa', name: 'فارسی', dir: 'rtl', intl: 'fa-IR' },
  { code: 'ar', name: 'العربية', dir: 'rtl', intl: 'ar' },
  { code: 'de', name: 'Deutsch', dir: 'ltr', intl: 'de-DE' },
  { code: 'es', name: 'Español', dir: 'ltr', intl: 'es-ES' },
  { code: 'fr', name: 'Français', dir: 'ltr', intl: 'fr-FR' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr', intl: 'tr-TR' },
  { code: 'ru', name: 'Русский', dir: 'ltr', intl: 'ru-RU' },
  { code: 'zh', name: '中文', dir: 'ltr', intl: 'zh-CN' },
]
export const DEFAULT_LANG = 'en'
const STORAGE_KEY = 'digiwp.lang'

const EN = import.meta.glob('../locales/en/*.json', { eager: true, import: 'default' })
const LAZY = import.meta.glob(['../locales/*/*.json', '!../locales/en/*.json'], { import: 'default' })

const nsOf = (path) => path.split('/').pop().replace(/\.json$/, '')
const bundle = (entries) => Object.fromEntries(entries.map(([p, v]) => [nsOf(p), v]))

const dicts = { en: bundle(Object.entries(EN)) }
let current = DEFAULT_LANG

const langInfo = (code) => LANGS.find((l) => l.code === code) || LANGS[0]
export const getLang = () => current
export const getDir = () => langInfo(current).dir
export const getIntlLocale = () => langInfo(current).intl

/** Has this browser ever chosen a language explicitly? */
export const hasStoredLang = () => storedLang() !== null

function storedLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return LANGS.some((l) => l.code === v) ? v : null
  } catch {
    return null
  }
}

/** Load a language's dictionaries (no-op for English or one already loaded). */
async function load(code) {
  if (dicts[code]) return
  const prefix = `../locales/${code}/`
  const entries = await Promise.all(
    Object.entries(LAZY)
      .filter(([p]) => p.startsWith(prefix))
      .map(async ([p, fn]) => [p, await fn()])
  )
  dicts[code] = bundle(entries)
}

function apply(code) {
  current = code
  const el = document.documentElement
  el.lang = code
  el.dir = langInfo(code).dir
}

/** Resolve the saved language (English when none) before the first render. */
export async function initI18n() {
  const code = storedLang() || DEFAULT_LANG
  try {
    await load(code)
    apply(code)
  } catch {
    apply(DEFAULT_LANG)
  }
}

/** Switch language; resolves once its strings are loaded and applied. */
export async function setLang(code) {
  if (!LANGS.some((l) => l.code === code)) return
  await load(code)
  apply(code)
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* private mode: session-only choice */ }
}

function lookup(code, key) {
  const dot = key.indexOf('.')
  if (dot < 0) return undefined
  let node = dicts[code]?.[key.slice(0, dot)]
  for (const part of key.slice(dot + 1).split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return node
}

function pluralKey(code, key, count) {
  const cat = new Intl.PluralRules(langInfo(code).intl).select(Number(count))
  return [`${key}_${cat}`, `${key}_other`]
}

/**
 * Translate `key`, interpolating `{name}` placeholders from `vars`.
 * Numbers in vars are formatted for the active locale (Persian digits in fa).
 * With `vars.count`, `<key>_one` / `<key>_other` (CLDR categories) are tried
 * first. Arrays and objects in the dictionary are returned as-is.
 */
export function t(key, vars) {
  const candidates = vars && vars.count != null ? [...pluralKey(current, key, vars.count), key] : [key]
  let value
  for (const code of [current, DEFAULT_LANG]) {
    for (const k of candidates) {
      value = lookup(code, k)
      if (value !== undefined) break
    }
    if (value !== undefined) break
  }
  if (value === undefined) return key
  if (typeof value !== 'string' || !vars) return value
  return value.replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) return m
    const v = vars[name]
    return typeof v === 'number' ? num(v) : String(v ?? '')
  })
}

/** True when `key` exists in the active language or English. */
export const hasKey = (key) => lookup(current, key) !== undefined || lookup(DEFAULT_LANG, key) !== undefined

// ---- Locale-aware formatting ------------------------------------
// Persian renders Persian digits and the Solar Hijri calendar through
// fa-IR; every other language uses its own Intl conventions.

const toDate = (v) => (v instanceof Date ? v : new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v))
const valid = (d) => !Number.isNaN(d.getTime())

export const num = (v, opts) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString(getIntlLocale(), opts) : String(v ?? ''))
/** Digits only (ids, codes, versions): localises digits without grouping. */
export const digits = (v) => {
  const s = String(v ?? '')
  if (current !== 'fa') return s
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
}
export const pct = (v) => num(Number(v) / 100, { style: 'percent', maximumFractionDigits: 0 })
export const date = (v, opts) => { const d = toDate(v); return valid(d) ? d.toLocaleDateString(getIntlLocale(), opts) : '—' }
export const dateTime = (v, opts) => { const d = toDate(v); return valid(d) ? d.toLocaleString(getIntlLocale(), opts) : '—' }
export const time = (v, opts = { hour: '2-digit', minute: '2-digit' }) => { const d = toDate(v); return valid(d) ? d.toLocaleTimeString(getIntlLocale(), opts) : '—' }

/** Relative time from a minute count: 0 → "just now", 90 → "1 hour ago". */
export function ago(mins) {
  const m = Math.max(0, Math.floor(Number(mins) || 0))
  if (m < 1) return t('common.time.justNow')
  const rtf = new Intl.RelativeTimeFormat(getIntlLocale(), { numeric: 'auto' })
  if (m < 60) return rtf.format(-m, 'minute')
  const h = Math.floor(m / 60)
  if (h < 24) return rtf.format(-h, 'hour')
  return rtf.format(-Math.floor(h / 24), 'day')
}

/** Relative time from a timestamp (ms epoch, Date, or ISO string). */
export const agoFrom = (v) => { const d = toDate(v); return valid(d) ? ago((Date.now() - d.getTime()) / 60000) : '—' }
