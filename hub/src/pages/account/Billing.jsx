import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge, NotMeasured } from '../../components/index.js'
import { faMoney, faNum } from '../../lib/format.js'
import { account } from '../../lib/api.js'

const HEAD = { title: 'اشتراک و صورت‌حساب', subtitle: 'پلن، روش پرداخت و فاکتورها' }

const INVOICE_COLS = '1.3fr 1fr 1fr 0.9fr'

function formatDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(Number(ts)).toLocaleDateString('fa-IR')
  } catch {
    return '—'
  }
}

function formatTrial(days) {
  if (days == null) return null
  return days === 0 ? 'امروز آخرین روز دسترسی آزمایشی'
    : days === 1 ? '۱ روز دیگر تا پایان دسترسی آزمایشی'
    : `${days} روز دیگر تا پایان دسترسی آزمایشی`
}

export default function Billing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [requesting, setRequesting] = useState(null)
  const [requestOk, setRequestOk] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([account.billing(), account.plans()])
      .then(([billing, plans]) => {
        if (!alive) return
        setData({ billing, plans })
      })
      .catch((e) => alive && setError(e?.message || 'بارگذاری اطلاعات اشتراک انجام نشد.'))
    return () => { alive = false }
  }, [])

  async function requestPilot(planId) {
    setRequesting(planId)
    setRequestOk(null)
    try {
      const res = await account.requestPilot(planId)
      setRequestOk({ planId, message: 'درخواست دسترسی آزمایشی ثبت شد.' })
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
      setRequestOk({ planId, error: e?.message || 'ثبت درخواست انجام نشد.' })
    } finally {
      setRequesting(null)
    }
  }

  if (error) {
    return (
      <>
        <PageHead {...HEAD} />
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 28, textAlign: 'center' }}>
          <Icon name="alert-triangle" size={32} style={{ color: 'var(--gd-warning)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>خطا در بارگذاری</div>
          <div style={{ fontSize: 14, color: 'var(--gd-text-secondary)', marginTop: 8 }}>{error}</div>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()} style={{ marginTop: 16 }}>تلاش دوباره</Button>
        </div>
      </>
    )
  }

  if (!data) return <PageHead {...HEAD} />

  const { billing, plans } = data
  const subscription = billing?.subscription
  const paymentUnavailable = billing?.payment?.provenance?.unavailable
  const invoicesUnavailable = billing?.invoices?.provenance?.unavailable

  const currentPlan = subscription?.plan
  const usagePct = currentPlan?.siteLimit ? Math.round(((subscription?.sitesUsed || 0) / currentPlan.siteLimit) * 100) : 0

  return (
    <>
      <PageHead {...HEAD} />

      {/* Current plan + payment method */}
      <div
        className="dwp-billing-top"
        style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginBottom: 24 }}
      >
        {/* Current plan */}
        <div style={{ borderRadius: 'var(--gd-radius-xl)', border: '1px solid var(--gd-primary-border)', background: 'var(--gd-primary-subtle)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="crown" size={19} />
                </span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>پلن {currentPlan?.name || '—'}</span>
                <Badge variant="primary" appearance="solid">{subscription?.status === 'trialing' ? 'دسترسی آزمایشی' : 'فعال'}</Badge>
              </div>
              <div style={{ fontSize: 13, color: 'var(--gd-text-secondary)', marginTop: 10 }}>
                {subscription?.isTrialing ? (
                  <><Icon name="sparkles" size={14} /> {formatTrial(subscription.daysLeftInTrial)}</>
                ) : (
                  <>تمدید بعدی: <b style={{ fontFamily: 'var(--gd-font-mono)' }}>{formatDate(subscription?.currentPeriodEnd)}</b></>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'left', flex: '0 0 auto' }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{faMoney(currentPlan?.price || 0)}</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>تومان / ماه</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
              <span style={{ color: 'var(--gd-text-secondary)', fontWeight: 600 }}>سایت‌های استفاده‌شده</span>
              <span style={{ fontFamily: 'var(--gd-font-mono)', fontWeight: 700 }}>{faNum(subscription?.sitesUsed || 0)} از {currentPlan?.siteLimit ? faNum(currentPlan.siteLimit) : 'نامحدود'}</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--gd-blue-100)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(usagePct, 100)}%`, height: '100%', background: 'var(--gd-primary)', borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
            <Button as={Link} to="/pricing" variant="primary" size="sm" leftIcon="arrow-up-circle">تغییر پلن</Button>
          </div>
        </div>

        {/* Payment method */}
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
            <Icon name="wallet" size={17} style={{ color: 'var(--gd-primary)' }} /> روش پرداخت
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '13px 15px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="landmark" size={20} style={{ color: 'var(--gd-text-secondary)' }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>درگاهی متصل نیست</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{paymentUnavailable || 'پرداخت هنوز فعال نشده است.'}</div>
            </div>
            <Badge variant="neutral" appearance="soft">غیرفعال</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.7 }}>
            در حال حاضر هزینه‌ای برداشت نمی‌شود. برای فعال‌سازی پرداخت با تیم فروش تماس بگیرید.
          </div>
        </div>
      </div>

      {/* Change plan */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>تغییر پلن</div>
      <div
        className="dwp-billing-plans"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}
      >
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan?.id
          const isDowngrade = plan.price < (currentPlan?.price || 0)
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
                <span style={{ position: 'absolute', top: -11, insetInlineStart: 20, background: 'var(--gd-primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 11px' }}>پلن فعلی</span>
              )}
              <div style={{ fontSize: 15, fontWeight: 800 }}>{plan.name}</div>
              <div>
                <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{faMoney(plan.price)}</span>{' '}
                <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>تومان / ماه</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--gd-text-secondary)' }}>
                {(plan.features || []).map((f) => (
                  <span key={f} style={{ display: 'flex', gap: 8 }}>
                    <Icon name="check" size={16} style={{ color: 'var(--gd-success)' }} /> {f}
                  </span>
                ))}
              </div>
              {isCurrent ? (
                <Button variant="secondary" size="sm" fullWidth disabled>پلن فعلی شما</Button>
              ) : (
                <Button
                  variant={isDowngrade ? 'ghost' : 'primary'}
                  size="sm"
                  fullWidth
                  disabled={busy}
                  leftIcon={busy ? 'loader' : undefined}
                  onClick={() => requestPilot(plan.id)}
                >
                  {busy ? 'در حال ثبت…' : isDowngrade ? `تنزل به ${plan.name}` : `ارتقا به ${plan.name}`}
                </Button>
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
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>فاکتورها</div>
      {invoicesUnavailable ? (
        <NotMeasured title="فاکتورها" reason={invoicesUnavailable} />
      ) : (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: INVOICE_COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
            <span>تاریخ</span>
            <span>مبلغ</span>
            <span>وضعیت</span>
            <span />
          </div>
          {(billing?.invoices?.list || []).length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--gd-text-muted)' }}>فاکتوری ثبت نشده.</div>
          )}
        </div>
      )}
    </>
  )
}
