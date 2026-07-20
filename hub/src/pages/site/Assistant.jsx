import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

const SUGGESTIONS = [
  'وضعیت پرداخت چطوره؟',
  'آخرین بکاپ کی بود؟',
  'چه آپدیت‌هایی در انتظارند؟',
]

const mono = { fontFamily: 'var(--gd-font-mono)' }

function Stat({ value, label, color }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '9px 13px' }}>
      <span style={{ ...mono, fontSize: 16, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--gd-text-muted)' }}>{label}</span>
    </span>
  )
}

export default function Assistant() {
  const { siteId, site } = useOutletContext()
  const siteName = site?.name || 'mystore.ir'

  const initialMessages = [
    { from: 'ai', kind: 'intro' },
    { from: 'user', text: 'چرا سایت امروز کمی کند شده؟' },
    { from: 'ai', kind: 'slowdown' },
    { from: 'user', text: 'بله، انجامش بده' },
    { from: 'ai', kind: 'done' },
  ]

  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send(text) {
    const q = (text ?? '').trim()
    if (!q || sending) return
    setMessages((m) => [...m, { from: 'user', text: q }])
    setInput('')
    setSending(true)
    try {
      const res = await siteApi(siteId).ask(q)
      setMessages((m) => [...m, { from: 'ai', text: res.reply, refs: res.refs }])
    } finally {
      setSending(false)
    }
  }

  const AiAvatar = () => (
    <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gd-accent-subtle)', color: 'var(--gd-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <Icon name="sparkles" size={19} />
    </span>
  )

  function renderMessage(m, i) {
    if (m.from === 'user') {
      return (
        <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '70%' }}>
          <div style={{ background: 'var(--gd-primary)', color: '#fff', borderRadius: 16, padding: '12px 16px', fontSize: 14, lineHeight: 1.8 }}>{m.text}</div>
        </div>
      )
    }

    let maxWidth = '78%'
    let body

    if (m.kind === 'intro') {
      body = (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '14px 17px', fontSize: 14, lineHeight: 1.85, color: 'var(--gd-text)', boxShadow: 'var(--gd-shadow-xs)' }}>
          من پشتیبان هوشمند سایت شما هستم. می‌توانید به زبان ساده هر سوالی دربارهٔ وضعیت، سرعت یا امنیت <span style={mono}>{siteName}</span> بپرسید.
        </div>
      )
    } else if (m.kind === 'slowdown') {
      maxWidth = '82%'
      body = (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '15px 18px', boxShadow: 'var(--gd-shadow-xs)' }}>
          <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--gd-text)' }}>
            میانگین زمان پاسخ امروز از <b>۲۱۰</b> به <b>۲۴۸</b> میلی‌ثانیه رسید. علت اصلی، بارگذاری ۱۸ تصویر بهینه‌نشده در صفحهٔ «محصولات جدید» بود که آن‌ها را فشرده و به WebP تبدیل کردم. عامل دوم، بزرگ‌شدن جدول‌های موقت دیتابیس است.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Stat value="۲۴۸ms" label="زمان پاسخ فعلی" />
            <Stat value="۱۸" label="تصویر بهینه‌شده" color="var(--gd-success-text)" />
            <Stat value="۳۴۰MB" label="قابل آزادسازی" color="var(--gd-warning-text)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <Button variant="primary" size="sm" leftIcon="sparkles">اجرای بهینه‌سازی دیتابیس</Button>
            <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="user-check" size={13} /> با تأیید شما انجام می‌شود
            </span>
          </div>
        </div>
      )
    } else if (m.kind === 'done') {
      body = (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '14px 17px', boxShadow: 'var(--gd-shadow-xs)' }}>
          <div style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--gd-text)' }}>
            پیش از تغییر یک بکاپ کامل گرفتم، سپس دیتابیس را بهینه کردم. <b>۳۴۰MB</b> آزاد شد و زمان پاسخ به <b>۲۱۲ms</b> برگشت.
          </div>
          <div style={{ marginTop: 10 }}>
            <Badge variant="success" appearance="soft" icon="check-circle-2">انجام شد</Badge>
          </div>
        </div>
      )
    } else {
      body = (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '14px 17px', boxShadow: 'var(--gd-shadow-xs)' }}>
          <div style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--gd-text)' }}>{m.text}</div>
          {m.refs?.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
              {m.refs.map((r) => (
                <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 999, padding: '4px 10px' }}>
                  <Icon name="link-2" size={12} /> {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth }}>
        <AiAvatar />
        {body}
      </div>
    )
  }

  return (
    <>
      <PageHead title="دستیار هوشمند" subtitle="به زبان ساده هر سوالی دربارهٔ سایت‌تان بپرسید" />

      <div style={{ display: 'flex', flexDirection: 'column', height: 610, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '26px 26px 20px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--gd-bg-subtle)' }}>
          {messages.map((m, i) => renderMessage(m, i))}

          {sending && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '78%' }}>
              <AiAvatar />
              <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '14px 17px', fontSize: 13, color: 'var(--gd-text-muted)', boxShadow: 'var(--gd-shadow-xs)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="loader-2" size={15} className="gd-activity__ic--spin" style={{ color: 'var(--gd-accent)' }} /> در حال بررسی…
              </div>
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--gd-border)', padding: '14px 18px', background: 'var(--gd-bg-surface)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={sending}
                style={{ fontSize: 12.5, fontFamily: 'inherit', color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: '6px 13px', cursor: sending ? 'default' : 'pointer' }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-pill)', padding: '6px 18px 6px 8px' }}>
            <input
              type="text"
              placeholder="سؤالتان را بنویسید…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--gd-font-sans)', fontSize: 14, color: 'var(--gd-text)' }}
            />
            <span
              onClick={() => send(input)}
              role="button"
              tabIndex={0}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', cursor: 'pointer', opacity: sending ? 0.6 : 1 }}
            >
              <Icon name="send" size={18} />
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
