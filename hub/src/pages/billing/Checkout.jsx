import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button } from '../../components/index.js'
import { t, num } from '../../lib/i18n.js'
import { account } from '../../lib/api.js'
import { MONTH_CHOICES, priceFor } from '../../lib/pricing.js'

/**
 * Checkout: choose a plan and a period, then pay on the gateway's page.
 * The amount shown is the server's own rule; the invoice the server opens is
 * the price actually charged. Without a configured gateway the page says so
 * and offers nothing to click that would pretend to take money.
 */
export default function Checkout() {
  const [params] = useSearchParams()
  const [plans, setPlans] = useState(null)
  const [payment, setPayment] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [planId, setPlanId] = useState(params.get('plan') || 'pro')
  const [months, setMonths] = useState(MONTH_CHOICES.includes(Number(params.get('months'))) ? Number(params.get('months')) : 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([account.plans(), account.billing()])
      .then(([p, b]) => { if (alive) { setPlans(p); setPayment(b?.payment || { configured: false }) } })
      .catch((e) => alive && setLoadError(e?.message || t('checkout.loadFailed')))
    return () => { alive = false }
  }, [])

  const plan = plans?.find((p) => p.id === planId) || plans?.[0]
  const total = plan ? priceFor(plan.price, months) : 0

  async function pay() {
    setBusy(true); setError('')
    try {
      const res = await account.checkout(plan.id, months)
      // Leave the panel for the gateway; it brings the browser back to /app/billing.
      window.location.assign(res.payUrl)
    } catch (e) {
      setError(e?.message || t('checkout.failed'))
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', color: 'var(--gd-text)', fontFamily: 'var(--gd-font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px', textAlign: 'center' }}>{t('checkout.title')}</h1>
        <p style={{ fontSize: 14.5, color: 'var(--gd-text-secondary)', margin: '0 0 22px', lineHeight: 1.8, textAlign: 'center' }}>{t('checkout.lead')}</p>

        {loadError && <p role="alert" style={{ color: 'var(--gd-danger-text)', textAlign: 'center' }}>{loadError}</p>}

        {plans && payment && (
          <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <fieldset style={fieldset}>
              <legend style={legend}>{t('checkout.plan')}</legend>
              <div style={choiceGrid}>
                {plans.map((p) => (
                  <label key={p.id} className="dwp-choice" style={choice(p.id === plan?.id)}>
                    <input type="radio" name="plan" value={p.id} checked={p.id === plan?.id} onChange={() => setPlanId(p.id)} style={srOnly} />
                    <span style={{ fontWeight: 800 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{t('checkout.perMonth', { amount: num(p.price) })}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset style={fieldset}>
              <legend style={legend}>{t('checkout.period')}</legend>
              <div style={choiceGrid}>
                {MONTH_CHOICES.map((m) => (
                  <label key={m} className="dwp-choice" style={choice(m === months)}>
                    <input type="radio" name="months" value={m} checked={m === months} onChange={() => setMonths(m)} style={srOnly} />
                    <span style={{ fontWeight: 800 }}>{t('checkout.months', { count: m })}</span>
                    {m === 12 && <span style={{ fontSize: 12, color: 'var(--gd-success-text)' }}>{t('checkout.yearBonus')}</span>}
                  </label>
                ))}
              </div>
            </fieldset>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 14 }}>
              <span style={{ fontWeight: 700 }}>{t('checkout.total')}</span>
              <span><b style={{ fontSize: 24, fontFamily: 'var(--gd-font-mono)' }}>{num(total)}</b> <span style={{ fontSize: 13, color: 'var(--gd-text-muted)' }}>{t('checkout.toman')}</span></span>
            </div>

            {payment.configured ? (
              <>
                {error && <p role="alert" style={{ color: 'var(--gd-danger-text)', fontSize: 13, margin: 0 }}>{error}</p>}
                <Button variant="primary" size="lg" fullWidth leftIcon="lock" loading={busy} onClick={pay}>
                  {t('checkout.pay')}
                </Button>
                <p style={note}>{t('checkout.gatewayNote')}</p>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--gd-bg-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '12px 14px' }}>
                <Icon name="info" size={18} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto', marginTop: 2 }} />
                <span style={{ fontSize: 13.5, color: 'var(--gd-text-secondary)', lineHeight: 1.8 }}>{t('checkout.notConfigured')}</span>
              </div>
            )}
          </div>
        )}

        <p style={{ marginTop: 20, textAlign: 'center' }}>
          <Link to="/app/billing" style={{ fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow-right" size={15} /> {t('checkout.back')}
          </Link>
        </p>
      </div>
    </div>
  )
}

const fieldset = { border: 0, padding: 0, margin: 0 }
const legend = { fontSize: 13, fontWeight: 700, marginBottom: 8, padding: 0 }
const choiceGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }
const choice = (on) => ({
  display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer', padding: '11px 13px',
  borderRadius: 'var(--gd-radius-lg)', border: on ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)',
  background: on ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
})
const srOnly = { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }
const note = { fontSize: 12, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.8, textAlign: 'center' }
