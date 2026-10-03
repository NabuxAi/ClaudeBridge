// Read-side rendering of stored event titles (i18n conventions, rule 4).
//
// A new event stores its title in English AND `detail.i18n = { key, vars }`;
// whoever serves the event to the hub renders the key in the reader's
// language. Old rows have no `i18n` and keep the stored text they were
// written with.
import { t, hasKey } from './i18n.js'

/** The event's title in `locale`, falling back to the stored text. */
export function eventTitle(locale, ev) {
  const i = ev?.detail?.i18n
  if (i && typeof i.key === 'string' && hasKey(i.key)) return t(locale, i.key, i.vars)
  return ev?.title
}

/** The same event with `title` rendered for `locale` (other fields untouched). */
export const localizeEvent = (locale, ev) => (ev ? { ...ev, title: eventTitle(locale, ev) } : ev)

/**
 * Arguments for events.record(): `title` in English plus the key in detail,
 * so the row can be re-rendered later in any language.
 */
export function i18nTitle(key, vars, detail) {
  return {
    title: t('en', key, vars),
    detail: { ...(detail || {}), i18n: vars ? { key, vars } : { key } },
  }
}
