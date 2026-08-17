// ============================================================
// Assistant Conversations & Messages Store
// ذخیره‌سازی دائمی گفتگوها و پردازش پس‌زمینه دستیار هوشمند
// ============================================================
import { all, one, query, newId } from './db.js'
import * as assistant from './assistant.js'
import * as events from './events.js'
import { config } from './config.js'

// In-memory fallback if running without PostgreSQL (e.g. unit test suite)
const MEM_CONVERSATIONS = new Map()
const MEM_MESSAGES = new Map()

export async function list(siteId, limit = 50) {
  if (!config.databaseUrl) {
    const list = Array.from(MEM_CONVERSATIONS.values())
      .filter((c) => c.site_id === siteId)
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limit)
    return list.map((c) => ({
      ...c,
      message_count: (MEM_MESSAGES.get(c.id) || []).length,
    }))
  }

  const rows = await all(
    `SELECT c.*, 
            COUNT(m.id)::int AS message_count,
            (SELECT text FROM assistant_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
     FROM assistant_conversations c
     LEFT JOIN assistant_messages m ON m.conversation_id = c.id
     WHERE c.site_id = $1
     GROUP BY c.id
     ORDER BY c.updated_at DESC
     LIMIT $2`,
    [siteId, limit]
  )
  return rows || []
}

export async function create(siteId, userId = null, title = 'گفتگوی جدید') {
  const id = newId('conv-')
  const now = Date.now()
  const cleanTitle = String(title || 'گفتگوی جدید').trim().slice(0, 120)

  if (!config.databaseUrl) {
    const conv = {
      id,
      site_id: siteId,
      user_id: userId,
      title: cleanTitle,
      status: 'ready',
      created_at: now,
      updated_at: now,
    }
    MEM_CONVERSATIONS.set(id, conv)
    MEM_MESSAGES.set(id, [])
    return conv
  }

  const row = await one(
    `INSERT INTO assistant_conversations (id, site_id, user_id, title, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ready', $5, $6)
     RETURNING *`,
    [id, siteId, userId, cleanTitle, now, now]
  )
  return row
}

export async function get(siteId, conversationId) {
  if (!config.databaseUrl) {
    const conv = MEM_CONVERSATIONS.get(conversationId)
    if (!conv || conv.site_id !== siteId) return null
    const messages = MEM_MESSAGES.get(conversationId) || []
    return { ...conv, messages }
  }

  const conv = await one(
    `SELECT * FROM assistant_conversations WHERE id = $1 AND site_id = $2`,
    [conversationId, siteId]
  )
  if (!conv) return null

  const messages = await all(
    `SELECT * FROM assistant_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  )
  return { ...conv, messages: messages || [] }
}

export async function update(siteId, conversationId, { title, status }) {
  const now = Date.now()
  if (!config.databaseUrl) {
    const conv = MEM_CONVERSATIONS.get(conversationId)
    if (!conv || conv.site_id !== siteId) return null
    if (title !== undefined) conv.title = String(title).trim().slice(0, 120)
    if (status !== undefined) conv.status = status
    conv.updated_at = now
    return conv
  }

  const fields = []
  const values = [conversationId, siteId]
  let idx = 3

  if (title !== undefined) {
    fields.push(`title = $${idx++}`)
    values.push(String(title).trim().slice(0, 120))
  }
  if (status !== undefined) {
    fields.push(`status = $${idx++}`)
    values.push(status)
  }
  fields.push(`updated_at = $${idx++}`)
  values.push(now)

  const row = await one(
    `UPDATE assistant_conversations SET ${fields.join(', ')} WHERE id = $1 AND site_id = $2 RETURNING *`,
    values
  )
  return row
}

export async function deleteConv(siteId, conversationId) {
  if (!config.databaseUrl) {
    const conv = MEM_CONVERSATIONS.get(conversationId)
    if (!conv || conv.site_id !== siteId) return false
    MEM_CONVERSATIONS.delete(conversationId)
    MEM_MESSAGES.delete(conversationId)
    return true
  }

  const res = await query(
    `DELETE FROM assistant_conversations WHERE id = $1 AND site_id = $2`,
    [conversationId, siteId]
  )
  return (res.rowCount || 0) > 0
}

export async function addMessage(siteId, conversationId, msg) {
  const id = newId('msg-')
  const now = Date.now()
  const payload = {
    id,
    conversation_id: conversationId,
    site_id: siteId,
    sender: msg.sender || 'user',
    text: msg.text || '',
    refs: msg.refs || null,
    note: msg.note || null,
    unknown: msg.unknown || null,
    proposals: msg.proposals || null,
    ran: msg.ran || null,
    error: msg.error || null,
    created_at: now,
  }

  if (!config.databaseUrl) {
    const list = MEM_MESSAGES.get(conversationId) || []
    list.push(payload)
    MEM_MESSAGES.set(conversationId, list)
    const conv = MEM_CONVERSATIONS.get(conversationId)
    if (conv) conv.updated_at = now
    return payload
  }

  const row = await one(
    `INSERT INTO assistant_messages 
     (id, conversation_id, site_id, sender, text, refs, note, unknown, proposals, ran, error, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      conversationId,
      siteId,
      payload.sender,
      payload.text,
      payload.refs ? JSON.stringify(payload.refs) : null,
      payload.note,
      payload.unknown ? JSON.stringify(payload.unknown) : null,
      payload.proposals ? JSON.stringify(payload.proposals) : null,
      payload.ran ? JSON.stringify(payload.ran) : null,
      payload.error,
      now,
    ]
  )

  await query(
    `UPDATE assistant_conversations SET updated_at = $1 WHERE id = $2`,
    [now, conversationId]
  )

  return row
}

/**
 * Process a user message in background.
 * Handles AI answering, proposal tracking, title auto-generation, and notification dispatch.
 */
export async function postAndProcess(site, conversationId, userText, { userId, maxToolSteps } = {}) {
  const text = String(userText || '').trim()
  if (!text) throw new Error('متن پیام نمی‌تواند خالی باشد.')

  // 1. Record user message
  const userMsg = await addMessage(site.id, conversationId, {
    sender: 'user',
    text,
  })

  // 2. Set conversation status to 'processing'
  const conv = await get(site.id, conversationId)
  const isFirstMessage = (conv?.messages?.length || 0) <= 1
  const newTitle = isFirstMessage && conv?.title === 'گفتگوی جدید'
    ? text.slice(0, 45) + (text.length > 45 ? '…' : '')
    : undefined

  await update(site.id, conversationId, {
    status: 'processing',
    ...(newTitle ? { title: newTitle } : {}),
  })

  // 3. Launch background execution (does not block returning immediately)
  const task = (async () => {
    try {
      const answerRes = await assistant.answer(site, text, { maxToolSteps })
      
      // Add AI reply message
      await addMessage(site.id, conversationId, {
        sender: 'ai',
        text: answerRes.reply || 'پاسخی دریافت نشد.',
        refs: answerRes.refs || null,
        note: answerRes.note || null,
        unknown: answerRes.unknown || null,
        proposals: answerRes.proposals || null,
        ran: answerRes.ran || null,
      })

      await update(site.id, conversationId, { status: 'ready' })

      // Emit event so in-app notifications and alerts trigger
      await events.record(site.id, {
        kind: 'assistant_reply',
        severity: 'info',
        title: `پاسخ دستیار آماده شد: «${(conv?.title || text).slice(0, 35)}»`,
        detail: answerRes.reply?.slice(0, 120),
      }).catch(() => {})

    } catch (err) {
      await addMessage(site.id, conversationId, {
        sender: 'ai',
        text: `خطا در دریافت پاسخ: ${err.message || 'خطای نامشخص'}`,
        error: err.message,
      })
      await update(site.id, conversationId, { status: 'error' })
    }
  })()

  return { userMessage: userMsg, conversationId, status: 'processing', backgroundPromise: task }
}
