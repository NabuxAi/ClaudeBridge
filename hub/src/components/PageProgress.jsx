import { useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { beginPending, finishNavigation, progressActive, subscribeProgress } from '../lib/page-progress.js'
import { t } from '../lib/i18n.js'

export default function PageProgress() {
  const location = useLocation()
  const active = useSyncExternalStore(subscribeProgress, progressActive)
  useEffect(() => {
    const finish = beginPending()
    let second
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { finishNavigation(); finish() })
    })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); finish() }
  }, [location.key])
  if (!/^\/(app|site|onboarding)(\/|$)/.test(location.pathname)) return null
  return <div className="panel-progress" data-active={active} role="progressbar" aria-label={t('shell.panel.loading')} aria-hidden={!active}><span /></div>
}
