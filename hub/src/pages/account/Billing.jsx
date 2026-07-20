import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge } from '../../components/index.js'
import { faMoney, faNum } from '../../lib/format.js'
import { account } from '../../lib/api.js'

const HEAD = { title: 'اشتراک و صورت‌حساب', subtitle: 'پلن، روش پرداخت و فاکتورها' }

const INVOICE_STATUS = {
  paid: { variant: 'success', label: 'پرداخت‌شده' },
  pending: { variant: 'warning', label: 'در انتظار پرداخت' },
  failed: { variant: 'danger', label: 'ناموفق' },
}

const INVOICE_COLS = '1.3fr 1fr 1fr 0.9fr'

export default function Billing() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([account.billing(), account.invoices(), account.plans()])
      .then(([billing, invoices, plans]) => alive && setData({ billing, invoices, plans }))
    return () => { alive = false }
  }, [])

  if (!data) return <PageHead {...HEAD} />

  const { billing, invoices, plans } = data
  const usagePct = billing.sitesLimit ? Math.round((billing.sitesUsed / billing.sitesLimit) * 100) : 0

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="crown" size={19} />
                </span>
                <span style={{ fontSize: 19, fontWeight: 800 }}>پلن {billing.plan}</span>
                <Badge variant="primary" appearance="solid">فعال</Badge>
              </div>
              <div style={{ fontSize: 13, color: 'var(--gd-text-secondary)', marginTop: 10 }}>
                تمدید بعدی: <b style={{ fontFamily: 'var(--gd-font-mono)' }}>{billing.renewsAt}</b> · تمدید خودکار روشن
              </div>
            </div>
            <div style={{ textAlign: 'left', flex: '0 0 auto' }}>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{faMoney(billing.price)}</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>تومان / ماه</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
              <span style={{ color: 'var(--gd-text-secondary)', fontWeight: 600 }}>سایت‌های استفاده‌شده</span>
              <span style={{ fontFamily: 'var(--gd-font-mono)', fontWeight: 700 }}>{faNum(billing.sitesUsed)} از {faNum(billing.sitesLimit)}</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--gd-blue-100)', overflow: 'hidden' }}>
              <div style={{ width: `${usagePct}%`, height: '100%', background: 'var(--gd-primary)', borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
            <Button variant="primary" size="sm" leftIcon="arrow-up-circle">ارتقای پلن</Button>
            <Button variant="ghost" size="sm">مدیریت اشتراک</Button>
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
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>درگاه زرین‌پال</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>کارت <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{billing.card}</span></div>
            </div>
            <Badge variant="success" appearance="soft" dot>متصل</Badge>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.7 }}>
            مبلغ بعدی <b style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{faMoney(billing.price)}</b> تومان در تاریخ <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{billing.renewsAt}</span> برداشت می‌شود.
          </div>
          <Button variant="secondary" size="sm" leftIcon="repeat" fullWidth>تغییر روش پرداخت</Button>
        </div>
      </div>

      {/* Change plan */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>تغییر پلن</div>
      <div
        className="dwp-billing-plans"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}
      >
        {plans.map((plan) => {
          const isCurrent = plan.name === billing.plan
          const isDowngrade = plan.price < billing.price
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
                {plan.features.map((f) => (
                  <span key={f} style={{ display: 'flex', gap: 8 }}>
                    <Icon name="check" size={16} style={{ color: 'var(--gd-success)' }} /> {f}
                  </span>
                ))}
              </div>
              {isCurrent ? (
                <Button variant="secondary" size="sm" fullWidth disabled>پلن فعلی شما</Button>
              ) : isDowngrade ? (
                <Button variant="ghost" size="sm" fullWidth>تنزل به {plan.name}</Button>
              ) : (
                <Button variant="primary" size="sm" fullWidth>ارتقا به {plan.name}</Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Invoices */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>فاکتورها</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: INVOICE_COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>تاریخ</span>
          <span>مبلغ</span>
          <span>وضعیت</span>
          <span />
        </div>
        {invoices.map((inv, i) => {
          const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.paid
          const last = i === invoices.length - 1
          return (
            <div
              key={inv.id}
              style={{ display: 'grid', gridTemplateColumns: INVOICE_COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: last ? 'none' : '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}
            >
              <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{inv.date}</span>
              <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{faMoney(inv.amount)} ت</span>
              <span style={{ display: 'flex' }}>
                <Badge variant={st.variant} appearance="soft">{st.label}</Badge>
              </span>
              <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button as={Link} to={`/invoice/${inv.id}`} variant="ghost" size="sm" leftIcon="download">فاکتور</Button>
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
