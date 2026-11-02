import { useEffect } from 'react'
import { beginPending } from '../lib/page-progress.js'
import { t } from '../lib/i18n.js'

export default function PanelPageLoader() {
  useEffect(() => beginPending(), [])
  return <div className="panel-page-loader" role="status" aria-label={t('common.loading')}>
    <div className="dwp-skeleton dwp-skeleton--title" />
    <div className="dwp-grid dwp-grid-4">{[0, 1, 2, 3].map((key) => <div key={key} className="dwp-skeleton panel-page-loader__card" />)}</div>
  </div>
}
