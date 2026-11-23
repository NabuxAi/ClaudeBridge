import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Badge } from '../../components/index.js'
import { t, num, date } from '../../lib/i18n.js'
import { account } from '../../lib/api.js'
import { INVOICE_BADGE } from '../../lib/pricing.js'


/** One invoice as the server recorded it: what was bought, what the bank said. */
export default function Invoice() {
  const { id } = useParams()
  const [inv, setInv] = useState(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let alive = true
    account.invoice(id)
      .then((r) => alive && setInv(r))
      .catch((e) => alive && setError(e?.status === 404 ? t('invoice.notFound', { id }) : (e?.message || t('invoice.loadFailed'))))
    return () => { alive = false }
  }, [id])

  async function recheck() {
    setChecking(true); setError('')
    try { setInv(await account.recheckInvoice(id)) } catch (e) { setError(e?.message || t('invoice.loadFailed')) } finally { setChecking(false) }
  }

  const row = (label, value, mono) => value == null ? null : (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--gd-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 700, ...(mono ? { fontFamily: 'var(--gd-font-mono)', direction: 'ltr' } : {}) }}>{value}</span>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', color: 'var(--gd-text)', fontFamily: 'var(--gd-font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {error && <p role="alert" style={{ color: 'var(--gd-danger-text)', textAlign: 'center' }}>{error}</p>}
        {inv && (
          <div className="gd-card gd-card--e-sm gd-card--p-md">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>{t('invoice.title')}</h1>
              <Badge variant={INVOICE_BADGE[inv.status] || 'neutral'} appearance="solid">{t(`invoice.status.${inv.status}`)}</Badge>
            </div>
            {row(t('invoice.number'), inv.id, true)}
            {row(t('invoice.plan'), t('invoice.planMonths', { plan: t(`invoice.plans.${inv.plan}`), count: inv.months }))}
            {row(t('invoice.amount'), `${num(inv.amount)} ${t('invoice.toman')}`)}
            {row(t('invoice.created'), date(inv.createdAt))}
            {inv.paidAt ? row(t('invoice.paidAt'), date(inv.paidAt)) : null}
            {inv.periodEnd ? row(t('invoice.period'), t('invoice.periodRange', { from: date(inv.periodStart), to: date(inv.periodEnd) })) : null}
            {row(t('invoice.bankRef'), inv.bankRef, true)}
            {row(t('invoice.card'), inv.cardMask, true)}
            {inv.status === 'failed' && <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: '12px 0 0', lineHeight: 1.8 }}>{t('invoice.failedNote')}</p>}
            {inv.status === 'pending' && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: 0, lineHeight: 1.8 }}>{t('invoice.pendingNote')}</p>
                <Button variant="secondary" size="md" leftIcon="refresh-cw" loading={checking} onClick={recheck}>{t('invoice.recheck')}</Button>
              </div>
            )}
          </div>
        )}
        <p style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/app/billing" style={{ fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow-right" size={15} /> {t('invoice.back')}
          </Link>
        </p>
      </div>
    </div>
  )
}
