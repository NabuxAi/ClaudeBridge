import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

// Only questions answerable from readings we really take. "وضعیت پرداخت چطوره؟"
// was here and nothing in this system watches payments — a suggested question
// with no possible honest answer is a promise the product breaks on click.
const SUGGESTIONS = [
  'آخرین بکاپ کی بود؟',
  'چه آپدیت‌هایی در انتظارند؟',
  'الان چه هشدار بازی دارم؟',
]

const mono = { fontFamily: 'var(--gd-font-mono)' }

export default function Assistant() {
  const { siteId, site } = useOutletContext()
  const siteName = site?.name || 'mystore.ir'

  // Just the greeting. What used to be here was a scripted exchange —
  // "response time went from ۲۱۰ to ۲۴۸ms", "I compressed ۱۸ images",
  // "I optimised the database and freed ۳۴۰MB" — presented as this site's own
  // history. None of it was measured, none of those actions exist, and it read
  // as a log of work already done on the customer's behalf.
  const initialMessages = [{ from: 'ai', kind: 'intro' }]

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
      setMessages((m) => [...m, {
        from: 'ai',
        text: res.reply,
        refs: res.refs,
        note: res.note,
        unknown: res.unknown,
        // What it wanted to do but was not allowed to. Without these on screen
        // the "confirm" authority level is indistinguishable from "report":
        // the server returns an exact, runnable proposal and nobody ever sees
        // it, so the only way to act is to go and do it by hand.
        proposals: res.proposals,
        ran: res.ran,
      }])
    } finally {
      setSending(false)
    }
  }

  // Run a proposal the assistant made. `approved: true` is what the actions
  // relay requires for anything it classes as sensitive; the server still
  // decides, so approving here cannot widen what is permitted.
  async function approve(messageIndex, proposal) {
    setMessages((m) => m.map((msg, i) =>
      i === messageIndex ? { ...msg, running: proposal.tool } : msg
    ))
    let outcome
    try {
      const res = await siteApi(siteId).runAction(proposal.tool, { args: proposal.args, approved: true })
      outcome = res?.ok === false ? (res.message || 'اجرا نشد.') : 'انجام شد.'
    } catch (e) {
      outcome = e?.message || 'اجرا نشد.'
    }
    setMessages((m) => m.map((msg, i) => {
      if (i !== messageIndex) return msg
      return {
        ...msg,
        running: null,
        proposals: msg.proposals.map((pr) =>
          pr.tool === proposal.tool ? { ...pr, outcome } : pr
        ),
      }
    }))
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
          من پشتیبان سایت <span style={mono}>{siteName}</span> هستم. آنچه می‌گویم از خواندن مستقیم خود سایت می‌آید — نسخه‌ها، صف به‌روزرسانی، هشدارهای باز و بکاپ‌ها. هر چیزی که اندازه نگرفته باشیم را هم صریح می‌گویم که نمی‌دانم.
        </div>
      )
    } else {
      body = (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 16, padding: '14px 17px', boxShadow: 'var(--gd-shadow-xs)' }}>
          <div style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--gd-text)' }}>{m.text}</div>
          {/* The limits travel with the answer, not in a footnote somewhere
              else. Someone reading "no open alerts" needs to know in the same
              breath that uptime is not among the things being watched. */}
          {m.note && (
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 9, lineHeight: 1.8, paddingTop: 9, borderTop: '1px solid var(--gd-border-subtle)' }}>
              {m.note}
            </div>
          )}
          {m.unknown?.length > 0 && (
            <ul style={{ margin: '7px 0 0', paddingInlineStart: 16, fontSize: 11.5, color: 'var(--gd-text-muted)', lineHeight: 1.8 }}>
              {m.unknown.map((u, k) => <li key={k}>{u}</li>)}
            </ul>
          )}
          {/* What it did, and what it wants permission to do.
              A proposal carries the real tool and the real arguments, so
              approving is one click rather than a second conversation. */}
          {m.ran?.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)', marginTop: 9 }}>
              اجرا شد: {m.ran.join('، ')}
            </div>
          )}
          {m.proposals?.length > 0 && (
            <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--gd-border-subtle)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {m.proposals.map((pr, k) => (
                <div key={k} style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <Icon name="shield" size={13} />
                    <span style={{ ...mono, fontSize: 12.5 }}>{pr.tool}</span>
                    {pr.kind === 'sensitive' && (
                      <span style={{ fontSize: 10.5, color: 'var(--gd-danger)', background: 'var(--gd-danger-subtle)', borderRadius: 999, padding: '2px 8px' }}>حساس</span>
                    )}
                  </div>
                  {pr.reason && (
                    <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 6, lineHeight: 1.8 }}>{pr.reason}</div>
                  )}
                  {pr.args && Object.keys(pr.args).length > 0 && (
                    <div style={{ ...mono, fontSize: 11, color: 'var(--gd-text-secondary)', marginTop: 6, direction: 'ltr', textAlign: 'left', wordBreak: 'break-all' }}>
                      {JSON.stringify(pr.args)}
                    </div>
                  )}
                  {pr.outcome ? (
                    <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)', marginTop: 8 }}>{pr.outcome}</div>
                  ) : (
                    <Button
                      size="sm"
                      variant="subtle"
                      style={{ marginTop: 8 }}
                      disabled={Boolean(m.running)}
                      onClick={() => approve(i, pr)}
                    >
                      {m.running === pr.tool ? 'در حال اجرا…' : 'تأیید و اجرا'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
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
