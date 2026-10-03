// Renders a translated string that contains inline markup.
//   "en": "Read the <link>pairing guide</link> first."
//   <Trans k="onboarding.hint" components={{ link: (c) => <Link to="/x">{c}</Link> }} />
// Tags are flat (no nesting); `<b>`, `<code>`, `<mono>` work without a
// component entry. Unknown tags render their text only — translations can
// never inject HTML.
import { Fragment } from 'react'
import { t } from '../lib/i18n.js'

const DEFAULTS = {
  b: (c) => <b>{c}</b>,
  strong: (c) => <strong>{c}</strong>,
  code: (c) => <code>{c}</code>,
  mono: (c) => <span className="dwp-mono">{c}</span>,
}

export default function Trans({ k, vars, components }) {
  const text = t(k, vars)
  if (typeof text !== 'string') return null
  const map = { ...DEFAULTS, ...components }
  const out = []
  const re = /<(\w+)>(.*?)<\/\1>/gs
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const render = map[m[1]]
    out.push(<Fragment key={m.index}>{render ? render(m[2]) : m[2]}</Fragment>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
