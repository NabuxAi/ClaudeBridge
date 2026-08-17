// Assistant persistent conversations and message storage tests
import test from 'node:test'
import assert from 'node:assert/strict'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('assistant persistent conversations (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_conversations'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)

  const { query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const conversations = await import('../src/conversations.store.js')
  const { users, sites } = await import('../src/store.js')

  test('creates, appends messages, updates and deletes persistent conversations', async () => {
    // 1. Create a user and site for relational integrity
    const user = await users.create('conv-test@example.com', 'Test Conv User', 'StrongPass123!@#')
    const site = await sites.create(user.id, 'myshop.ir', 'https://myshop.ir')

    // 2. Create conversation
    const conv = await conversations.create(site.id, user.id, 'بررسی پایگاه داده')
    assert.ok(conv.id.startsWith('conv-'))
    assert.equal(conv.title, 'بررسی پایگاه داده')
    assert.equal(conv.status, 'ready')

    // 3. List conversations
    const list = await conversations.list(site.id)
    assert.ok(list.length >= 1)
    assert.equal(list[0].id, conv.id)

    // 4. Add user message
    const userMsg = await conversations.addMessage(site.id, conv.id, {
      sender: 'user',
      text: 'وضعیت آپشن‌های اتولود چطوره؟',
    })
    assert.ok(userMsg.id.startsWith('msg-'))

    // 5. Add AI reply
    const aiMsg = await conversations.addMessage(site.id, conv.id, {
      sender: 'ai',
      text: 'حجم اتولود ۶۲۰ کیلوبایت و در وضعیت مطلوب است.',
      ran: ['db_autoload_check'],
    })
    assert.ok(aiMsg.id.startsWith('msg-'))

    // 6. Get full conversation
    const full = await conversations.get(site.id, conv.id)
    assert.ok(full)
    assert.equal(full.messages.length, 2)
    assert.equal(full.messages[0].sender, 'user')
    assert.equal(full.messages[1].sender, 'ai')

    // 7. Update title and status
    const updated = await conversations.update(site.id, conv.id, {
      title: 'تحلیل عملکرد دیتابیس',
      status: 'ready',
    })
    assert.equal(updated.title, 'تحلیل عملکرد دیتابیس')

    // 8. Delete conversation
    const deleted = await conversations.deleteConv(site.id, conv.id)
    assert.equal(deleted, true)

    const afterDelete = await conversations.get(site.id, conv.id)
    assert.equal(afterDelete, null)
  })
}
