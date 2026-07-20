import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button } from '../../components/index.js'
import { account } from '../../lib/api.js'

export default function Invoice() {
  const { id } = useParams()
  const [inv, setInv] = useState(null)

  useEffect(() => {
    let alive = true
    account.invoice(id).then((d) => alive && setInv(d))
    return () => { alive = false }
  }, [id])

  if (!inv) return null

  return (
    <div dir="rtl" style={{ fontFamily: 'var(--gd-font-sans)', color: 'var(--gd-text)', background: 'var(--gd-bg-app)', minHeight: '100vh' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', background: 'var(--gd-bg-surface)', borderBottom: '1px solid var(--gd-border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gd-text-secondary)' }}>
          فاکتور شمارهٔ <span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{inv.id}</span>
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" leftIcon="mail">ارسال به ایمیل</Button>
        <Button variant="secondary" size="sm" leftIcon="download">دانلود PDF</Button>
        <Button variant="primary" size="sm" leftIcon="printer" onClick={() => window.print()}>چاپ</Button>
      </div>

      {/* Sheet */}
      <div style={{ padding: 34, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 794, maxWidth: '100%', background: '#fff', border: '1px solid var(--gd-border)', boxShadow: 'var(--gd-shadow-md)', borderRadius: 6, padding: '48px 52px', position: 'relative', color: '#1a2130' }}>

          {inv.status === 'paid' && (
            <div style={{ position: 'absolute', top: 120, insetInlineStart: 70, transform: 'rotate(-16deg)', border: '3px solid var(--gd-success)', color: 'var(--gd-success)', borderRadius: 12, padding: '8px 22px', fontSize: 26, fontWeight: 800, letterSpacing: '.04em', opacity: 0.85 }}>پرداخت شد</div>
          )}

          {/* Head: seller / invoice meta */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, paddingBottom: 24, borderBottom: '2px solid #1a2130' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield-check" size={24} /></span>
                <span style={{ fontWeight: 800, fontSize: 22, color: '#1a2130' }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
              </div>
              <div style={{ fontSize: 12.5, color: '#4a5568', lineHeight: 1.9, marginTop: 12 }}>
                شرکت دیجی‌وی‌پی (سهامی خاص)<br />تهران، خیابان ولیعصر، کوچهٔ نهم، پلاک ۲۴<br />تلفن: ۰۲۱-۹۱۰۰۲۰۳۰ · ai.digiwp.com
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', color: '#1a2130' }}>فاکتور فروش</div>
              <div style={{ fontSize: 12.5, color: '#4a5568', lineHeight: 2, marginTop: 10 }}>
                شماره: <span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>{inv.id}</span><br />تاریخ صدور: <span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۱۴۰۳/۰۴/۰۱</span><br />سررسید: <span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۱۴۰۳/۰۴/۰۱</span>
              </div>
            </div>
          </div>

          {/* Bill-to / payment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '24px 0' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8794a8', letterSpacing: '.04em', marginBottom: 8 }}>صورت‌حساب برای</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1a2130' }}>مریم رضایی</div>
              <div style={{ fontSize: 12.5, color: '#4a5568', lineHeight: 1.95, marginTop: 4 }}>
                فروشگاه آنلاین mystore.ir<br />ایمیل: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>maryam@digiwp.com</span><br />کد ملی: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>۰۰۱۲۳۴۵۶۷۸</span>
              </div>
            </div>
            <div style={{ background: '#f6f8fb', border: '1px solid #e4e9f0', borderRadius: 8, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8794a8', letterSpacing: '.04em', marginBottom: 8 }}>اطلاعات پرداخت</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: '#4a5568' }}><span>روش پرداخت</span><span style={{ color: '#1a2130', fontWeight: 600 }}>درگاه زرین‌پال</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: '#4a5568' }}><span>کد رهگیری</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>A-10293847</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: '#4a5568' }}><span>تاریخ پرداخت</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۱۴۰۳/۰۴/۰۱</span></div>
            </div>
          </div>

          {/* Items table */}
          <div style={{ border: '1px solid #e4e9f0', borderRadius: 8, overflow: 'hidden', marginTop: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 3fr 0.8fr 1.4fr 1.4fr', background: '#1a2130', color: '#fff', fontSize: 12, fontWeight: 700 }}>
              <span style={{ padding: '11px 12px' }}>ردیف</span>
              <span style={{ padding: '11px 12px' }}>شرح</span>
              <span style={{ padding: '11px 12px', textAlign: 'center' }}>تعداد</span>
              <span style={{ padding: '11px 12px', textAlign: 'left' }}>مبلغ واحد</span>
              <span style={{ padding: '11px 12px', textAlign: 'left' }}>مبلغ کل</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 3fr 0.8fr 1.4fr 1.4fr', fontSize: 12.5, color: '#1a2130', borderBottom: '1px solid #eef1f6' }}>
              <span style={{ padding: '14px 12px', fontFamily: 'var(--gd-font-mono)' }}>۱</span>
              <span style={{ padding: '14px 12px' }}>اشتراک پلن حرفه‌ای — دورهٔ سالانه<div style={{ fontSize: 11, color: '#8794a8', marginTop: 2 }}>۱۴۰۳/۰۴/۰۱ تا ۱۴۰۴/۰۴/۰۱</div></span>
              <span style={{ padding: '14px 12px', textAlign: 'center', fontFamily: 'var(--gd-font-mono)' }}>۱</span>
              <span style={{ padding: '14px 12px', textAlign: 'left', fontFamily: 'var(--gd-font-mono)' }}>۵٬۸۸۰٬۰۰۰</span>
              <span style={{ padding: '14px 12px', textAlign: 'left', fontFamily: 'var(--gd-font-mono)' }}>۵٬۸۸۰٬۰۰۰</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '0.5fr 3fr 0.8fr 1.4fr 1.4fr', fontSize: 12.5, color: '#1a2130' }}>
              <span style={{ padding: '14px 12px', fontFamily: 'var(--gd-font-mono)' }}>۲</span>
              <span style={{ padding: '14px 12px' }}>تخفیف پرداخت سالانه (۲ ماه رایگان)</span>
              <span style={{ padding: '14px 12px', textAlign: 'center', fontFamily: 'var(--gd-font-mono)' }}>۱</span>
              <span style={{ padding: '14px 12px', textAlign: 'left', fontFamily: 'var(--gd-font-mono)', color: '#2f9e5b' }}>−۹۸۰٬۰۰۰</span>
              <span style={{ padding: '14px 12px', textAlign: 'left', fontFamily: 'var(--gd-font-mono)', color: '#2f9e5b' }}>−۹۸۰٬۰۰۰</span>
            </div>
          </div>

          {/* Amount in words + totals */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginTop: 22, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, background: '#f6f8fb', border: '1px solid #e4e9f0', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8794a8', marginBottom: 5 }}>مبلغ به حروف</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2130', lineHeight: 1.7 }}>پنج میلیون و سیصد و نود هزار تومان</div>
            </div>
            <div style={{ width: 320, flex: '0 0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 4px', color: '#4a5568' }}><span>جمع کل</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۵٬۸۸۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 4px', color: '#4a5568' }}><span>تخفیف</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#2f9e5b' }}>−۹۸۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 4px', color: '#4a5568', borderTop: '1px solid #e4e9f0' }}><span>جمع پس از تخفیف</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۴٬۹۰۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 4px', color: '#4a5568' }}><span>مالیات بر ارزش افزوده (۱۰٪)</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: '#1a2130' }}>۴۹۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: '#1a2130', color: '#fff', borderRadius: 8, padding: '12px 14px', marginTop: 8 }}><span style={{ fontSize: 13.5, fontWeight: 800 }}>مبلغ قابل پرداخت</span><span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>۵٬۳۹۰٬۰۰۰</span></div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px dashed #cbd3e0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
            <div style={{ fontSize: 11, color: '#8794a8', lineHeight: 1.9 }}>
              شناسهٔ اقتصادی: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>۴۱۱۳۸۷۶۵۹۰۰۲</span> · شمارهٔ ثبت: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>۵۸۷۴۱۹</span><br />این فاکتور به‌صورت الکترونیکی صادر شده و مطابق قوانین مالیاتی کشور معتبر است.
            </div>
            <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
              <div style={{ width: 90, height: 90, border: '1px dashed #cbd3e0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b3bccb', fontSize: 10 }}>مهر و امضا</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
