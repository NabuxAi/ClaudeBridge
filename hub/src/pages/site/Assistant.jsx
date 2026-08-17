import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, IconButton } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

const SUGGESTIONS = [
  'آخرین بکاپ کی بود و آیا سالمه؟',
  'چه آپدیت‌هایی در صف هستند؟',
  'الان چه هشدار بازی داریم؟',
  'وضعیت امنیت و فایل‌های هسته چطوره؟',
]

const mono = { fontFamily: 'var(--gd-font-mono)' }

function AiAvatar() {
  return (
    <span style={{
      width: 36, height: 36, borderRadius: '50%',
      background: 'var(--gd-accent-subtle)', color: 'var(--gd-accent)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flex: '0 0 auto',
    }}>
      <Icon name="sparkles" size={18} />
    </span>
  )
}

export default function Assistant() {
  const { siteId, site } = useOutletContext()
  const siteName = site?.name || 'mystore.ir'

  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [activeConv, setActiveConv] = useState(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingConv, setLoadingConv] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [notificationBanner, setNotificationBanner] = useState(null)

  const scrollRef = useRef(null)
  const pollingRef = useRef(null)
  const activeIdRef = useRef(null)
  activeIdRef.current = activeConvId

  // Request browser notification permission once
  const requestNotificationPermission = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {})
      }
    }
  }, [])

  // Trigger browser or in-app notification when reply arrives
  const notifyReply = useCallback((title, text) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title || 'پاسخ هوش مصنوعی آماده است', {
          body: text || 'دستیار هوشمند پاسخ سایت شما را ثبت کرد.',
          icon: '/icon-192.png',
        })
      } catch {
        // notification error
      }
    }
    setNotificationBanner({ title, text })
    setTimeout(() => setNotificationBanner(null), 7000)
  }, [])

  // 1. Fetch conversations list
  const loadConversations = useCallback(async (selectId = null) => {
    try {
      const res = await siteApi(siteId).listConversations()
      const list = res?.conversations || []
      setConversations(list)

      if (list.length > 0) {
        const targetId = selectId || (list.some((c) => c.id === activeIdRef.current) ? activeIdRef.current : list[0].id)
        setActiveConvId(targetId)
      } else {
        // Create initial default conversation
        const created = await siteApi(siteId).createConversation('گفتگوی اصلی')
        if (created?.id) {
          setConversations([created])
          setActiveConvId(created.id)
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoadingList(false)
    }
  }, [siteId])

  // 2. Fetch messages for active conversation
  const loadActiveConversation = useCallback(async (convId, isPoll = false) => {
    if (!convId) return
    if (!isPoll) setLoadingConv(true)
    try {
      const conv = await siteApi(siteId).getConversation(convId)
      if (conv) {
        // If it was processing and now ready, notify!
        if (activeConv?.status === 'processing' && conv.status === 'ready' && isPoll) {
          const lastAiMsg = [...(conv.messages || [])].reverse().find((m) => m.sender === 'ai')
          notifyReply(`پاسخ دستیار: ${conv.title}`, lastAiMsg?.text?.slice(0, 100))
        }
        setActiveConv(conv)
      }
    } catch {
      // Fallback
    } finally {
      if (!isPoll) setLoadingConv(false)
    }
  }, [siteId, activeConv?.status, notifyReply])

  // Initial mount: load conversations list
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // When activeConvId changes, load its conversation data
  useEffect(() => {
    if (activeConvId) {
      loadActiveConversation(activeConvId)
    }
  }, [activeConvId, loadActiveConversation])

  // Polling when active conversation is processing in background
  useEffect(() => {
    if (activeConv?.status === 'processing' && activeConvId) {
      pollingRef.current = setInterval(() => {
        loadActiveConversation(activeConvId, true)
      }, 3000)
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeConv?.status, activeConvId, loadActiveConversation])

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeConv?.messages, sending])

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      const created = await siteApi(siteId).createConversation('گفتگوی جدید')
      if (created?.id) {
        setConversations((prev) => [created, ...prev])
        setActiveConvId(created.id)
        setActiveConv(created)
      }
    } catch (e) {
      alert(e?.message || 'خطا در ایجاد گفتگوی جدید')
    }
  }

  // Delete conversation
  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation()
    if (!window.confirm('آیا از حذف این گفتگو اطمینان دارید؟')) return
    try {
      await siteApi(siteId).deleteConversation(convId)
      const remaining = conversations.filter((c) => c.id !== convId)
      setConversations(remaining)
      if (activeConvId === convId) {
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id)
        } else {
          handleNewConversation()
        }
      }
    } catch (err) {
      alert(err?.message || 'خطا در حذف گفتگو')
    }
  }

  // Save renamed title
  const handleSaveTitle = async () => {
    if (!titleInput.trim() || !activeConvId) {
      setEditingTitle(false)
      return
    }
    try {
      const updated = await siteApi(siteId).updateConversation(activeConvId, { title: titleInput.trim() })
      if (updated) {
        setActiveConv((prev) => ({ ...prev, title: updated.title }))
        setConversations((prev) => prev.map((c) => c.id === activeConvId ? { ...c, title: updated.title } : c))
      }
    } catch {
      // error
    } finally {
      setEditingTitle(false)
    }
  }

  // Send message
  const handleSend = async (textToSend) => {
    const q = (textToSend ?? input).trim()
    if (!q || sending || !activeConvId) return

    requestNotificationPermission()
    setInput('')
    setSending(true)

    // Optimistically add user message to current state
    const optimisticUserMsg = {
      id: 'temp-' + Date.now(),
      sender: 'user',
      text: q,
      created_at: Date.now(),
    }

    setActiveConv((prev) => ({
      ...prev,
      status: 'processing',
      messages: [...(prev?.messages || []), optimisticUserMsg],
    }))

    try {
      const res = await siteApi(siteId).sendConversationMessage(activeConvId, q)
      if (res?.messages) {
        setActiveConv(res)
        // Refresh conversations list to update title and updated_at
        loadConversations(activeConvId)
      }
    } catch (e) {
      setActiveConv((prev) => ({
        ...prev,
        status: 'error',
        messages: [
          ...(prev?.messages || []),
          {
            id: 'err-' + Date.now(),
            sender: 'ai',
            text: `خطا در ارسال درخواست: ${e?.message || 'مشکل در ارتباط با سرور'}`,
            error: e?.message,
            created_at: Date.now(),
          },
        ],
      }))
    } finally {
      setSending(false)
    }
  }

  // Approve a proposal
  const handleApproveProposal = async (msgId, proposal) => {
    try {
      setActiveConv((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === msgId ? { ...m, running: proposal.tool } : m
        ),
      }))

      const res = await siteApi(siteId).runAction(proposal.tool, {
        args: proposal.args,
        approved: true,
        ...(proposal.id ? { proposalId: proposal.id } : {}),
      })

      const outcome = res?.ok === false ? (res.message || 'اجرا نشد.') : 'با موفقیت انجام شد.'

      setActiveConv((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== msgId) return m
          return {
            ...m,
            running: null,
            proposals: (m.proposals || []).map((pr) =>
              pr.tool === proposal.tool ? { ...pr, outcome } : pr
            ),
          }
        }),
      }))
    } catch (err) {
      const outcome = err?.message || 'اجرا نشد.'
      setActiveConv((prev) => ({
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== msgId) return m
          return {
            ...m,
            running: null,
            proposals: (m.proposals || []).map((pr) =>
              pr.tool === proposal.tool ? { ...pr, outcome } : pr
            ),
          }
        }),
      }))
    }
  }

  const messages = activeConv?.messages || []

  return (
    <>
      <PageHead title="دستیار هوشمند وردپرس" subtitle="پشتیبان فنی همیشه بیدار، مستند به لاگ‌های زنده و تحلیل چند لایه" />

      {/* In-app Notification Banner */}
      {notificationBanner && (
        <div style={{
          position: 'fixed', top: 20, insetInlineStart: '50%', transform: 'translateX(50%)',
          zIndex: 999, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-primary-border)',
          boxShadow: 'var(--gd-shadow-xl)', borderRadius: 'var(--gd-radius-lg)', padding: '12px 18px',
          display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bell" size={17} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{notificationBanner.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)', marginTop: 2 }}>{notificationBanner.text}</div>
          </div>
          <IconButton icon="x" label="بستن" size="sm" onClick={() => setNotificationBanner(null)} />
        </div>
      )}

      {/* Main 2-Pane Container */}
      <div style={{
        display: 'grid', gridTemplateColumns: '270px 1fr', height: 660,
        background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
        borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden',
      }}>
        {/* Sidebar: Conversations List */}
        <div style={{
          borderInlineEnd: '1px solid var(--gd-border)', background: 'var(--gd-bg-surface)',
          display: 'flex', flexDirection: 'column', height: '100%',
        }}>
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--gd-border-subtle)' }}>
            <Button
              variant="primary"
              size="sm"
              leftIcon="plus"
              fullWidth
              onClick={handleNewConversation}
            >
              گفتگوی جدید
            </Button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {loadingList ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--gd-text-muted)' }}>
                در حال بارگذاری گفتگوها…
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12.5, color: 'var(--gd-text-muted)' }}>
                گفتگویی ثبت نشده است.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {conversations.map((conv) => {
                  const isActive = conv.id === activeConvId
                  const isProcessing = conv.status === 'processing'
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 'var(--gd-radius-md)',
                        background: isActive ? 'var(--gd-primary-subtle)' : 'transparent',
                        border: isActive ? '1px solid var(--gd-primary-border)' : '1px solid transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
                        transition: 'background var(--gd-duration)',
                      }}
                    >
                      <span style={{
                        color: isActive ? 'var(--gd-primary)' : 'var(--gd-text-muted)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name="message-square" size={16} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: isActive ? 700 : 500,
                          color: isActive ? 'var(--gd-primary)' : 'var(--gd-text)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {conv.title || 'گفتگوی بدون عنوان'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: 'var(--gd-text-muted)' }}>
                          {isProcessing && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--gd-warning)' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gd-warning)' }} />
                              در حال پردازش
                            </span>
                          )}
                          {!isProcessing && conv.created_at && (
                            <span>{new Date(Number(conv.updated_at || conv.created_at)).toLocaleDateString('fa-IR')}</span>
                          )}
                        </div>
                      </div>
                      <IconButton
                        icon="trash-2"
                        label="حذف"
                        size="sm"
                        style={{ opacity: 0.5 }}
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Pane */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          {/* Conversation Header */}
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--gd-border)',
            background: 'var(--gd-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              {editingTitle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 360 }}>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle() }}
                    autoFocus
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--gd-radius-sm)', border: '1px solid var(--gd-primary)',
                      fontSize: 13, fontFamily: 'inherit', flex: 1, outline: 'none',
                    }}
                  />
                  <Button size="sm" variant="primary" onClick={handleSaveTitle}>ذخیره</Button>
                  <Button size="sm" variant="subtle" onClick={() => setEditingTitle(false)}>انصراف</Button>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeConv?.title || 'گفتگو با دستیار'}
                  </span>
                  <IconButton
                    icon="pencil"
                    label="ویرایش عنوان"
                    size="sm"
                    onClick={() => {
                      setTitleInput(activeConv?.title || '')
                      setEditingTitle(true)
                    }}
                  />
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeConv?.status === 'processing' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gd-warning)', background: 'var(--gd-warning-bg)', padding: '4px 10px', borderRadius: 'var(--gd-radius-pill)' }}>
                  <Icon name="loader-2" size={13} className="gd-activity__ic--spin" /> در حال تحلیل در پس‌زمینه…
                </span>
              )}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column',
            gap: 18, background: 'var(--gd-bg-subtle)',
          }}>
            {/* Intro Welcome Card */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '85%' }}>
              <AiAvatar />
              <div style={{
                background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
                borderRadius: 16, padding: '14px 17px', fontSize: 13.5, lineHeight: 1.85,
                color: 'var(--gd-text)', boxShadow: 'var(--gd-shadow-xs)',
              }}>
                من دستیار هوشمند و متصل به موتور چندعامله سایت <span style={mono}>{siteName}</span> هستم. هر سوال یا بررسی امنیتی، سرعت، آپدیت و رفع تداخل دارید بفرمایید تا مستقیماً با بررسی لاگ‌های زنده سایت پاسخ دهم.
              </div>
            </div>

            {loadingConv && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--gd-text-muted)', fontSize: 13 }}>
                در حال بارگذاری پیام‌ها…
              </div>
            )}

            {/* Render Saved Messages */}
            {messages.map((m, i) => {
              if (m.sender === 'user') {
                return (
                  <div key={m.id || i} style={{ alignSelf: 'flex-end', maxWidth: '75%' }}>
                    <div style={{
                      background: 'var(--gd-primary)', color: '#fff', borderRadius: 16,
                      padding: '11px 16px', fontSize: 13.5, lineHeight: 1.8,
                    }}>
                      {m.text}
                    </div>
                  </div>
                )
              }

              return (
                <div key={m.id || i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '85%' }}>
                  <AiAvatar />
                  <div style={{
                    background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
                    borderRadius: 16, padding: '14px 17px', boxShadow: 'var(--gd-shadow-xs)',
                  }}>
                    <div style={{ fontSize: 13.5, lineHeight: 1.85, color: 'var(--gd-text)', whiteSpace: 'pre-wrap' }}>
                      {m.text}
                    </div>

                    {m.note && (
                      <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 9, lineHeight: 1.8, paddingTop: 9, borderTop: '1px solid var(--gd-border-subtle)' }}>
                        {m.note}
                      </div>
                    )}

                    {m.unknown && Array.isArray(m.unknown) && m.unknown.length > 0 && (
                      <ul style={{ margin: '7px 0 0', paddingInlineStart: 16, fontSize: 11.5, color: 'var(--gd-text-muted)', lineHeight: 1.8 }}>
                        {m.unknown.map((u, k) => <li key={k}>{u}</li>)}
                      </ul>
                    )}

                    {m.ran && Array.isArray(m.ran) && m.ran.length > 0 && (
                      <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)', marginTop: 9 }}>
                        اقدام انجام شده: {m.ran.join('، ')}
                      </div>
                    )}

                    {m.proposals && Array.isArray(m.proposals) && m.proposals.length > 0 && (
                      <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--gd-border-subtle)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {m.proposals.map((pr, k) => (
                          <div key={k} style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 12, padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                              <Icon name="shield-check" size={14} />
                              <span style={{ ...mono, fontSize: 12.5, fontWeight: 700 }}>{pr.tool}</span>
                              {pr.kind === 'sensitive' && (
                                <span style={{ fontSize: 10.5, color: 'var(--gd-danger)', background: 'var(--gd-danger-subtle)', borderRadius: 999, padding: '2px 8px' }}>حساس</span>
                              )}
                            </div>
                            {pr.reason && (
                              <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 6, lineHeight: 1.8 }}>{pr.reason}</div>
                            )}
                            {pr.outcome ? (
                              <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)', marginTop: 8 }}>{pr.outcome}</div>
                            ) : (
                              <Button
                                size="sm"
                                variant="subtle"
                                style={{ marginTop: 8 }}
                                disabled={Boolean(m.running)}
                                onClick={() => handleApproveProposal(m.id, pr)}
                              >
                                {m.running === pr.tool ? 'در حال اجرا…' : 'تأیید و اجرا'}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.refs && Array.isArray(m.refs) && m.refs.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                        {m.refs.map((r) => (
                          <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 999, padding: '4px 10px' }}>
                            <Icon name="link-2" size={12} /> {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Thinking / Background Processing Indicator */}
            {(sending || activeConv?.status === 'processing') && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '85%' }}>
                <AiAvatar />
                <div style={{
                  background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
                  borderRadius: 16, padding: '12px 16px', fontSize: 13, color: 'var(--gd-text-muted)',
                  boxShadow: 'var(--gd-shadow-xs)', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                  <Icon name="loader-2" size={15} className="gd-activity__ic--spin" style={{ color: 'var(--gd-primary)' }} />
                  <span>دستیار در حال بررسی لاگ‌های سایت و پردازش در پس‌زمینه است…</span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions & Input Area */}
          <div style={{ borderTop: '1px solid var(--gd-border)', padding: '12px 18px', background: 'var(--gd-bg-surface)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSend(s)}
                  disabled={sending || activeConv?.status === 'processing'}
                  style={{
                    fontSize: 12, fontFamily: 'inherit', color: 'var(--gd-text-secondary)',
                    background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)',
                    borderRadius: 999, padding: '5px 12px', cursor: (sending || activeConv?.status === 'processing') ? 'default' : 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gd-bg-inset)',
              border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-pill)', padding: '6px 16px 6px 8px',
            }}>
              <input
                type="text"
                placeholder="سؤالتان را بنویسید (مثلاً: وضعیت امنیت چطوره؟)…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend(input) }}
                disabled={sending || activeConv?.status === 'processing'}
                style={{
                  flex: 1, border: 'none', background: 'none', outline: 'none',
                  fontFamily: 'var(--gd-font-sans)', fontSize: 13.5, color: 'var(--gd-text)',
                }}
              />
              <span
                onClick={() => handleSend(input)}
                role="button"
                tabIndex={0}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--gd-primary)',
                  color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flex: '0 0 auto', cursor: 'pointer', opacity: (sending || activeConv?.status === 'processing') ? 0.6 : 1,
                }}
              >
                <Icon name="send" size={16} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
