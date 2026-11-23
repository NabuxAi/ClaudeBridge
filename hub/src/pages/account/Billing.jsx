import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge, NotMeasured } from '../../components/index.js'
import Trans from '../../components/Trans.jsx'
import { t, num, digits, date } from '../../lib/i18n.js'
import { account, ApiError } from '../../lib/api.js'
import { INVOICE_BADGE } from '../../lib/pricing.js'

const head = () => ({ title: t('billing.title'), subtitle: t('billing.subtitle') })

const INVOICE_COLS = '1.3fr 1fr 1fr 0.9fr'

function formatDate(ts) {
  if (!ts) return '—'
  return date(Number(ts))
}

function formatTrial(days) {
  if (days == null) return null
  return days === 0 ? t('billing.trialLastDay') : t('billing.trialLeft', { count: days })
}

const monoDate = { date: (c) => <b style={{ fontFamily: 'var(--gd-font-mono)' }}>{c}</b> }

export default function Billing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [requesting, setRequesting] = useState(null)
  const [requestOk, setRequestOk] = useState(null)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // The gateway brings the browser back here with ?invoice=<id>.
  const returnedId = params.get('invoice')
  const [returned, setReturned] = useState(null)
  const [rechecking, setRechecking] = useState(false)

  useEffect(() => {
    if (!returnedId) return undefined
    let alive = true
    account.invoice(returnedId).then((r) => alive && setReturned(r)).catch(() => {})
    return () => { alive = false }
  }, [returnedId])

  async function recheckReturned() {
    setRechecking(true)
    try {
      const r = await account.recheckInvoice(returned.id)
      setReturned(r)
      if (r.status === 'paid') setData((prev) => prev && { ...prev, stale: true })
    } catch { /* the banner keeps its pending state and the button stays */ } finally { setRechecking(false) }
  }

  // A payment that just settled changes the subscription: reload it.
  useEffect(() => {
    if (!data?.stale && !(returned?.status === 'paid')) return undefined
    let alive = true
    account.billing().then((billing) => alive && setData((prev) => prev && { ...prev, billing, stale: false })).catch(() => {})
    return () => { alive = false }
  }, [returned?.status, data?.stale])

  useEffect(() => {
    let alive = true
    Promise.all([account.billing(), account.plans()])
      .then(([billing, plans]) => {
        if (!alive) return
        setData({ billing, plans })
      })
      .catch((e) => alive && setError(e?.message || t('billing.loadFailed')))
    return () => { alive = false }
  }, [])

  async function requestPilot(planId) {
    setRequesting(planId)
    setRequestOk(null)
    try {
      const res = await account.requestPilot(planId)
      setRequestOk({ planId, message: t('billing.pilotRequested') })
      if (res?.subscription) {
        setData((prev) => ({
          ...prev,
          billing: {
            ...prev.billing,
            subscription: res.subscription,
          },
        }))
      }
    } catch (e) {
      setRequestOk({
        planId,
        // A raw English «Not Found» from an unmounted endpoint tells the user
        // nothing; name what is actually missing instead.
        error: e instanceof ApiError && e.status === 404 && (!e.message || e.message === 'Not Found')
          ? t('billing.pilotNotEnabled')
          : (e?.message || t('billing.pilotFailed')),
      })
    } finally {
      setRequesting(null)
    }
  }

  if (error) {
    return (
      <>
        <PageHead {...head()} />
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 28, textAlign: 'center' }}>
          <Icon name="alert-triangle" size={32} style={{ color: 'var(--gd-warning)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('billing.loadErrorTitle')}</div>
          <div style={{ fontSize: 14, color: 'var(--gd-text-secondary)', marginTop: 8 }}>{error}</div>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>{t('common.retry')}</Button>
        </div>
      </>
    )
  }

  if (!data) return <PageHead {...head()} />

  const { billing, plans } = data
  const subscription = billing?.subscription
  const billingUnavailable = billing?.provenance?.unavailable
  const paymentUnavailable = billing?.payment?.provenance?.unavailable
  const invoicesUnavailable = billing?.invoices?.provenance?.unavailable

  // Trial state, honest: a raw `status: 'trialing'` also reads 'trialing'
  // after the window has passed. The server now sends `trialState`
  // ('trialing' | 'expired' | 'ended'); the derivation behind it is the same
  // rule, so a response (or dev mock) without the field still renders truth.
  const trialState = subscription
    ? (subscription.trialState
      || (subscription.isTrialing ? 'trialing' : subscription.status === 'trialing' ? 'expired' : 'ended'))
    : null
  const trialExpired = trialState === 'expired'
  const paymentConfigured = !!billing?.payment?.configured
  const invoiceList = billing?.invoices?.list || []
  // Pilot access: once per account, never over a running trial or a paid plan
  // (the server refuses the same cases with 409).
  const canPilot = subscription && !subscription.pilotRequested && !subscription.isTrialing && subscription.status !== 'active'
  const currentPlan = subscription?.plan
  const currentPlanLimit = currentPlan?.siteLimit ?? null
  const capReached = currentPlanLimit != null && (subscription?.sitesUsed || 0) >= currentPlanLimit
  const usagePct = currentPlanLimit ? Math.round(((subscription?.sitesUsed || 0) / currentPlanLimit) * 100) : 0

  return (
    <>
      <PageHead {...head()} />

      {returnedId && (
        <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 20,
          background: returned?.status === 'paid' ? 'var(--gd-success-bg)' : returned?.status === 'failed' ? 'var(--gd-danger-bg)' : 'var(--gd-warning-bg)',
          border: `1px solid ${returned?.status === 'paid' ? 'var(--gd-success-border)' : returned?.status === 'failed' ? 'var(--gd-danger)' : 'var(--gd-warning)'}` }}>
          <Icon name={returned?.status === 'paid' ? 'check-circle-2' : returned?.status === 'failed' ? 'alert-octagon' : 'clock'} size={19} />
          <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.8 }}>
            {!returned ? t('billing.result.loading')
              : returned.status === 'paid' ? t('billing.result.paid', { date: formatDate(returned.periodEnd) })
                : returned.status === 'failed' ? t('billing.result.failed')
                  : t('billing.result.pending')}
          </div>
          {returned?.status === 'pending' && (
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" loading={rechecking} onClick={recheckReturned}>{t('billing.result.recheck')}</Button>
          )}
          {returned && <Button as={Link} to={`/invoice/${returned.id}`} variant="ghost" size="sm">{t('billing.result.view')}</Button>}
        </div>
      )}
      {params.get('payment') === 'unknown' && (
        <div role="status" style={{ background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 20, fontSize: 13.5, lineHeight: 1.8 }}>
          {t('billing.result.unknown')}
        </div>
      )}
      {subscription?.paidExpired && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px', marginBottom: 24 }}>
          <Icon name="alert-triangle" size={19} style={{ color: 'var(--gd-warning)', flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--gd-text-secondary)' }}>
            <b style={{ color: 'var(--gd-text)' }}>{t('billing.paidExpired.lead')}</b>{' '}{t('billing.paidExpired.body')}
          </div>
        </div>
      )}

      {/* Expired trial: say what is actually blocked (adding sites), what
          still works (everything already in the account), and what does NOT
          exist (a payment gateway) — instead of a fake checkout button. */}
      {trialExpired && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px', marginBottom: 24 }}>
          <Icon name="alert-triangle" size={19} style={{ color: 'var(--gd-warning)', flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--gd-text-secondary)' }}>
            <b style={{ color: 'var(--gd-text)' }}>{t('billing.expired.lead')}</b>{' '}
            {t('billing.expired.body')}
          </div>
        </div>
      )}

      {/* Current plan + payment method */}
      <div className="dwp-billing-top" style={{ marginBottom: 24 }}>
        {/* Current plan — or the honest NOT_BUILT state. The server answers
            GET /billing without a subscription while billing is not active;
            rendering «پلن —», a green «فعال» badge and «۰ از نامحدود» there
            fabricated a contract the product does not have. */}
        {!subscription ? (
          <NotMeasured
            title={t('billing.notActive.title')}
            reason={billingUnavailable || t('billing.notActive.reason')}
          />
        ) : (
          <div style={{ borderRadius: 'var(--gd-radius-xl)', border: '1px solid var(--gd-primary-border)', background: 'var(--gd-primary-subtle)', padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="crown" size={19} />
                  </span>
                  <span style={{ fontSize: 19, fontWeight: 800 }}>{t('billing.planName', { name: currentPlan?.name || '—' })}</span>
                  {/* Same source as the trial line below: a raw `status` can
                      still read «trialing» after the trial window has passed,
                      and «فعال» without a gateway would fabricate a renewal. */}
                  {subscription.isTrialing ? (
                    <Badge variant="primary" appearance="solid">{t('billing.badge.trial')}</Badge>
                  ) : trialExpired ? (
                    <Badge variant="danger" appearance="solid">{t('billing.badge.trialExpired')}</Badge>
                  ) : subscription.paidExpired ? (
                    <Badge variant="danger" appearance="solid">{t('billing.badge.paidExpired')}</Badge>
                  ) : (
                    <Badge variant="success" appearance="solid">{t('billing.badge.active')}</Badge>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gd-text-secondary)', marginTop: 10 }}>
                  {subscription.isTrialing ? (
                    <><Icon name="sparkles" size={14} /> {formatTrial(subscription.daysLeftInTrial)}</>
                  ) : trialExpired ? (
                    <Trans k="billing.trialEndedOn" vars={{ date: formatDate(subscription?.trialEndsAt) }} components={monoDate} />
                  ) : subscription.isPaid ? (
                    <Trans k="billing.paidUntil" vars={{ date: formatDate(subscription?.currentPeriodEnd), count: subscription.daysLeftInPeriod ?? 0 }} components={monoDate} />
                  ) : subscription?.currentPeriodEnd ? (
                    <Trans k="billing.periodEndedOn" vars={{ date: formatDate(subscription?.currentPeriodEnd) }} components={monoDate} />
                  ) : (
                    <>{t('billing.noRenewal')}</>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'end', flex: '0 0 auto' }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{currentPlan?.price == null ? '—' : num(currentPlan.price)}</div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{t('billing.perMonth')}</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ color: 'var(--gd-text-secondary)', fontWeight: 600 }}>{t('billing.sitesUsed')}</span>
                <span style={{ fontFamily: 'var(--gd-font-mono)', fontWeight: 700 }}>{t('billing.usage', { used: digits(subscription?.sitesUsed || 0), limit: currentPlan?.siteLimit ? digits(currentPlan.siteLimit) : t('billing.unlimited') })}</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--gd-blue-100)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(usagePct, 100)}%`, height: '100%', background: capReached ? 'var(--gd-danger)' : 'var(--gd-primary)', borderRadius: 999 }} />
              </div>
              {capReached && (
                <div style={{ fontSize: 12, color: 'var(--gd-danger-text)', marginTop: 7 }}>
                  {t('billing.capReached')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
              {paymentConfigured && (
                <Button as={Link} to={`/checkout?plan=${currentPlan?.id || 'pro'}`} variant="primary" size="sm" leftIcon="credit-card">
                  {subscription.status === 'active' ? t('billing.renew') : t('billing.buy')}
                </Button>
              )}
              <Button as={Link} to="/pricing" variant={paymentConfigured ? 'secondary' : 'primary'} size="sm" leftIcon="arrow-up-circle">{t('billing.changePlan')}</Button>
            </div>
          </div>
        )}

        {/* Payment method */}
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
            <Icon name="wallet" size={17} style={{ color: 'var(--gd-primary)' }} /> {t('billing.payment.title')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '13px 15px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="landmark" size={20} style={{ color: paymentConfigured ? 'var(--gd-primary)' : 'var(--gd-text-secondary)' }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{paymentConfigured ? t('billing.payment.gateway') : t('billing.payment.noGateway')}</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{paymentConfigured ? t('billing.payment.gatewayNote') : (paymentUnavailable || t('billing.payment.notActive'))}</div>
            </div>
            <Badge variant={paymentConfigured ? 'success' : 'neutral'} appearance="soft">{paymentConfigured ? t('billing.payment.enabled') : t('billing.payment.disabled')}</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.7 }}>
            {paymentConfigured ? t('billing.payment.noCardStored') : t('billing.payment.note')}
          </div>
        </div>
      </div>

      {/* Change plan */}
      <div className="dwp-sec-title">{currentPlan ? t('billing.changePlan') : t('billing.plansTitle')}</div>
      <div className="dwp-billing-plans" style={{ marginBottom: 24 }}>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan?.id
          const canRenewTrial = isCurrent && trialExpired
          const requested = requestOk?.planId === plan.id
          const busy = requesting === plan.id
          return (
            <div
              key={plan.id}
              style={{
                background: 'var(--gd-bg-surface)',
                border: isCurrent ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)',
                borderRadius: 'var(--gd-radius-lg)',
                boxShadow: isCurrent ? 'var(--gd-shadow-md)' : 'var(--gd-shadow-xs)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 13,
                position: 'relative',
              }}
            >
              {isCurrent && (
                <span style={{ position: 'absolute', top: -11, insetInlineStart: 20, background: 'var(--gd-primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 11px' }}>{t('billing.currentPlan')}</span>
              )}
              <div style={{ fontSize: 15, fontWeight: 800 }}>{plan.name}</div>
              <div>
                <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{num(plan.price)}</span>{' '}
                <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{t('billing.perMonth')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--gd-text-secondary)' }}>
                {(plan.features || []).map((f) => (
                  <span key={f} style={{ display: 'flex', gap: 8 }}>
                    <Icon name="check" size={16} style={{ color: 'var(--gd-success)' }} /> {f}
                  </span>
                ))}
              </div>
              {paymentConfigured ? (
                <Button variant={plan.popular ? 'primary' : 'secondary'} size="sm" fullWidth leftIcon="credit-card"
                  onClick={() => navigate(`/checkout?plan=${plan.id}`)}>
                  {isCurrent && subscription?.status === 'active' ? t('billing.renew') : t('billing.buyPlan', { name: plan.name })}
                </Button>
              ) : null}
              {canPilot && (
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  disabled={requesting !== null}
                  leftIcon={busy ? 'loader' : undefined}
                  onClick={() => requestPilot(plan.id)}
                >
                  {busy ? t('billing.submitting') : canRenewTrial ? t('billing.renewTrial') : t('billing.requestTrial')}
                </Button>
              )}
              {!paymentConfigured && !canPilot && isCurrent && (
                <Button variant="secondary" size="sm" fullWidth disabled>{t('billing.yourCurrentPlan')}</Button>
              )}
              {requested && (
                <div style={{ fontSize: 12, color: requestOk.error ? 'var(--gd-danger)' : 'var(--gd-success-text)', textAlign: 'center' }}>
                  {requestOk.error ? requestOk.error : requestOk.message}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Invoices */}
      <div className="dwp-sec-title">{t('billing.invoices.title')}</div>
      {invoicesUnavailable ? (
        <NotMeasured title={t('billing.invoices.title')} reason={invoicesUnavailable} />
      ) : (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: INVOICE_COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
            <span>{t('billing.invoices.date')}</span>
            <span>{t('billing.invoices.amount')}</span>
            <span>{t('billing.invoices.status')}</span>
            <span />
          </div>
          {invoiceList.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--gd-text-muted)' }}>{t('billing.invoices.empty')}</div>
          )}
          {invoiceList.map((inv) => (
            <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: INVOICE_COLS, gap: 12, padding: '12px 20px', borderTop: '1px solid var(--gd-border-subtle)', fontSize: 13, alignItems: 'center' }}>
              <span>{formatDate(inv.createdAt)}</span>
              <span style={{ fontFamily: 'var(--gd-font-mono)', fontWeight: 700 }}>{num(inv.amount)}</span>
              <span><Badge variant={INVOICE_BADGE[inv.status] || 'neutral'} appearance="soft">{t(`invoice.status.${inv.status}`)}</Badge></span>
              <span style={{ textAlign: 'end' }}><Link to={`/invoice/${inv.id}`} style={{ fontWeight: 700 }}>{t('billing.invoices.view')}</Link></span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
