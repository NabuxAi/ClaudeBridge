import Icon from '../lib/icons.jsx'
import { t, dateTime } from '../lib/i18n.js'

/** Why a server could not see the site, from the server's own i18n key. */
const REASONS = {
  'sites.discoveryTimeout': 'timeout',
  'sites.wordpressForbidden': 'forbidden',
  'sites.wordpressNotFound': 'notFound',
  'sites.reach.peerUnavailable': 'peerUnavailable',
}

const serverLabel = (s) =>
  s.region ? t(`sites.reach.server.${s.region}`) : t(s.self ? 'sites.reach.server.self' : 'sites.reach.server.peer')

/**
 * Which DigiWP server (international / Iran) could see this WordPress site,
 * and the road this server takes to it. Renders exactly what the check saw;
 * a missing check is said plainly, never drawn as green.
 */
export default function SiteReach({ reach, compact = false }) {
  if (!reach || !Array.isArray(reach.servers) || reach.servers.length === 0) {
    return <p className="site-reach__none">{t('sites.reach.unchecked')}</p>
  }
  const route = reach.route === 'peer' ? 'peer' : reach.route === 'direct' ? 'direct' : 'none'
  return (
    <div className="site-reach" aria-label={t('sites.reach.title')}>
      {!compact && <div className="site-reach__title">{t('sites.reach.title')}</div>}
      <ul className="site-reach__list">
        {reach.servers.map((s, i) => (
          <li key={`${s.region}-${i}`} className={s.ok ? 'is-ok' : 'is-fail'}>
            <Icon name={s.ok ? 'check-circle-2' : 'alert-circle'} size={16} />
            <span className="site-reach__server">{serverLabel(s)}{s.self ? ` · ${t('sites.reach.thisServer')}` : ''}</span>
            <span className="site-reach__state">
              {s.ok ? t('sites.reach.ok') : t(`sites.reach.reason.${REASONS[s.reason] || 'unknown'}`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="site-reach__route">{t(`sites.reach.route.${route}`)}</p>
      {reach.checkedAt && !compact && <p className="site-reach__when">{t('sites.reach.checkedAt', { when: dateTime(reach.checkedAt, { dateStyle: 'short', timeStyle: 'short' }) })}</p>}
    </div>
  )
}
