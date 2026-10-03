// ============================================================
// Server i18n.
//
// Every human-readable string the server sends (error messages, labels,
// scope notes, emails, push/Telegram text) lives in
// src/locales/<lang>/<namespace>.json and is addressed as
// "<namespace>.<path>". English is the default and the fallback.
//
// Request-scoped text uses the hub's Accept-Language (req.locale / req.t);
// background text (emails, alerts) uses the recipient's stored users.lang;
// operator-only text (Telegram digest, logs) uses config.operatorLocale.
//
// Errors thrown deep in stores carry a key, not a sentence: httpError()
// below records {key, vars} and the app's error handler renders it in the
// caller's language. err.message stays English for logs.
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LOCALES = ['en', 'fa', 'ar', 'de', 'es', 'fr', 'tr', 'ru', 'zh']
export const DEFAULT_LOCALE = 'en'
const INTL = { en: 'en-US', fa: 'fa-IR', ar: 'ar', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', tr: 'tr-TR', ru: 'ru-RU', zh: 'zh-CN' }

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales')

function loadLocale(code) {
  const dir = path.join(ROOT, code)
  const out = {}
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json')) out[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
  return out
}

const dicts = Object.fromEntries(LOCALES.map((c) => [c, loadLocale(c)]))

export const normalizeLocale = (v) => {
  const base = String(v || '').trim().toLowerCase().split(/[-_]/)[0]
  return LOCALES.includes(base) ? base : null
}

/** Best supported language from an Accept-Language header; English when none fits. */
export function pickLocale(header) {
  if (!header) return DEFAULT_LOCALE
  const ranked = String(header).split(',').map((part, i) => {
    const [tag, ...params] = part.trim().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    return { code: normalizeLocale(tag), q: q ? Number(q.slice(2)) || 0 : 1, i }
  }).filter((r) => r.code && r.q > 0).sort((a, b) => b.q - a.q || a.i - b.i)
  return ranked[0]?.code || DEFAULT_LOCALE
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

export const hasKey = (key) => typeof key === 'string' && lookup(DEFAULT_LOCALE, key) !== undefined

export const formatNumber = (locale, n) => Number(n).toLocaleString(INTL[normalizeLocale(locale) || DEFAULT_LOCALE])

/**
 * Translate `key` into `locale`, interpolating `{name}` from `vars`.
 * With `vars.count`, `<key>_one` / `<key>_other` (CLDR plural categories)
 * are tried first. Missing in the locale → English → the key itself.
 */
export function t(locale, key, vars) {
  const code = normalizeLocale(locale) || DEFAULT_LOCALE
  const candidates = [key]
  if (vars && vars.count != null) {
    const cat = new Intl.PluralRules(INTL[code]).select(Number(vars.count))
    candidates.unshift(`${key}_${cat}`, `${key}_other`)
  }
  let value
  outer: for (const c of [code, DEFAULT_LOCALE]) {
    for (const k of candidates) {
      value = lookup(c, k)
      if (value !== undefined) break outer
    }
  }
  if (value === undefined) return key
  if (typeof value !== 'string' || !vars) return value
  return value.replace(/\{(\w+)\}/g, (m, name) => {
    if (!(name in vars)) return m
    const v = vars[name]
    return typeof v === 'number' ? formatNumber(code, v) : String(v ?? '')
  })
}

/** Express middleware: req.locale from Accept-Language, req.t bound to it. */
export function i18nMiddleware(req, _res, next) {
  req.locale = pickLocale(req.get('accept-language'))
  req.t = (key, vars) => t(req.locale, key, vars)
  next()
}

/**
 * An HTTP error whose message is a translation key. The error handler
 * renders it in the caller's language; err.message is the English text so
 * logs stay readable. A string that is not a known key is kept verbatim
 * (e.g. a provider's own error text).
 */
export function httpError(status, key, vars, code) {
  const known = hasKey(key)
  const e = new Error(known ? t(DEFAULT_LOCALE, key, vars) : key)
  e.status = status
  if (known) e.i18n = { key, vars }
  if (code) e.code = code
  return e
}

/** The message of any error, in `locale` when it carries a key. */
export const errorMessage = (locale, err) => (err?.i18n ? t(locale, err.i18n.key, err.i18n.vars) : err?.message)
