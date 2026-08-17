// The assistant could previously only describe a site. These tests drive the
// tool loop end to end and prove the wiring: a tool the model asks for is
// actually relayed to the connector, a refusal comes back as a proposal rather
// than as silence, and the authority level is what decides between the two.
//
// Both hops are HTTP, so one `fetch` stub routed by URL covers the whole path —
// the model call and the connector call — without mocking any module. That also
// means the connector's real signing and response handling run, rather than a
// stand-in for them.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// A fetch Response double. Both json() and text() are provided because that is
// what a real Response offers, and the connector reads the body as text so a
// non-JSON error page can be reported rather than silently discarded.
const respond = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})


process.env.ASSISTANT_URL = 'https://gateway.test'
process.env.ASSISTANT_API_KEY = 'test-key'
process.env.ASSISTANT_MODEL = 'nabu-smart'
process.env.LIVE = '1'

const assistant = await import('../src/assistant.js')

const SITE = {
  id: 'site-1',
  url: 'https://example.test',
  secret: 's3cr3t',
  site_key: 'k',
  paired: true,
  authority: 'report',
}

const say = (content) => ({ role: 'assistant', content })
const call = (name, args = {}) => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
})

/**
 * Scripts the model's turns and records everything either hop sent.
 *
 * `toolFails` makes the WordPress side answer like a connector that is down,
 * which is the branch where a failure has to reach the model rather than being
 * swallowed.
 */
function harness(turns, { toolFails = false } = {}) {
  const sentToModel = []
  const calledTools = []
  let turn = 0

  globalThis.fetch = async (url, opts) => {
    const target = String(url)

    if (target.startsWith('https://gateway.test')) {
      sentToModel.push(JSON.parse(opts.body))
      const message = turns[Math.min(turn++, turns.length - 1)]
      return respond({ choices: [{ message }] })
    }

    // Everything else is the managed site's MCP endpoint.
    const body = JSON.parse(opts.body)
    calledTools.push({ name: body.params.name, args: body.params.arguments })
    if (toolFails) {
      return respond({ error: { message: 'connector timeout' } }, 502)
    }
    return {
      ok: true,
      status: 200,
      ...respond({ result: { content: [{ text: JSON.stringify({ ok: true }) }] } }),
    }
  }

  return { sentToModel, calledTools }
}

test('a read tool the model asks for actually reaches the site', async () => {
  const { calledTools } = harness([call('list_plugins'), say('سه افزونه فعال است.')])

  const out = await assistant.answer({ ...SITE, authority: 'report' }, 'چه افزونه‌هایی دارم؟')

  assert.ok(
    calledTools.some((c) => c.name === 'list_plugins'),
    'the tool the model requested never reached the connector',
  )
  assert.equal(out.reply, 'سه افزونه فعال است.')
  assert.ok(out.ran?.includes('list_plugins'))
})

test('under report, a change is proposed rather than performed', async () => {
  const { calledTools } = harness([call('flush_cache'), say('پیشنهاد می‌کنم کش پاک شود.')])

  const out = await assistant.answer({ ...SITE, authority: 'report' }, 'سایت کند است')

  assert.equal(
    calledTools.some((c) => c.name === 'flush_cache'),
    false,
    'a mutating tool ran while the level was report',
  )
  assert.equal(out.requiresApproval, true)
  assert.equal(out.proposals[0].tool, 'flush_cache')
  assert.match(out.proposals[0].reason, /گزارش/)
})

test('under confirm, the change is still the owner’s to approve', async () => {
  const { calledTools } = harness([call('install_plugin', { slug: 'wordfence' }), say('نصبش کنم؟')])

  const out = await assistant.answer({ ...SITE, authority: 'confirm' }, 'امنیت سایت را بهتر کن')

  assert.equal(calledTools.some((c) => c.name === 'install_plugin'), false)
  assert.equal(out.requiresApproval, true)
  // The proposal carries the real arguments, so approving it needs no retyping.
  assert.deepEqual(out.proposals[0].args, { slug: 'wordfence' })
})

test('under auto, the same change is performed', async () => {
  const { calledTools } = harness([call('flush_cache'), say('کش پاک شد.')])

  const out = await assistant.answer({ ...SITE, authority: 'auto' }, 'سایت کند است')

  assert.ok(
    calledTools.some((c) => c.name === 'flush_cache'),
    'auto authority did not actually run the tool',
  )
  assert.equal(out.requiresApproval, undefined)
  assert.ok(out.ran.includes('flush_cache'))
})

test('a destructive tool is refused even under auto', async () => {
  const { calledTools } = harness([
    call('db_query', { sql: 'DROP TABLE wp_posts' }),
    say('این کار تأیید شما را می‌خواهد.'),
  ])

  const out = await assistant.answer({ ...SITE, authority: 'auto' }, 'جدول را پاک کن')

  assert.equal(
    calledTools.some((c) => c.name === 'db_query'),
    false,
    'raw SQL ran unattended',
  )
  assert.equal(out.requiresApproval, true)
  assert.equal(out.proposals[0].kind, 'sensitive')
})

test('a tool nobody has classified is refused rather than run', async () => {
  // New tools arrive in the plugin before they arrive in authority.js.
  const { calledTools } = harness([call('some_tool_shipped_next_week'), say('این ابزار را نمی‌شناسم.')])

  const out = await assistant.answer({ ...SITE, authority: 'auto' }, 'یه کاری بکن')

  // gatherFacts always reads site_info/update_status/backup_list first, so the
  // assertion is about this tool specifically, not about the call count.
  assert.equal(
    calledTools.some((c) => c.name === 'some_tool_shipped_next_week'),
    false,
    'an unclassified tool was relayed to the site',
  )
  assert.equal(out.proposals[0].kind, 'sensitive')
})

test('the loop stops instead of driving the site forever', async () => {
  // A model that asks for a tool on every turn must not keep the connector busy.
  const { calledTools } = harness([call('site_info')])

  const out = await assistant.answer({ ...SITE, authority: 'auto' }, 'وضعیت؟')

  assert.ok(calledTools.length <= 10, `tool loop ran ${calledTools.length} times`)
  assert.ok(out.reply, 'the loop must still produce an answer')
})

test('an unpaired site is never offered tools at all', async () => {
  const { sentToModel } = harness([say('سایت هنوز وصل نشده است.')])

  await assistant.answer({ ...SITE, paired: false, url: '', secret: '' }, 'وضعیت؟')

  assert.equal(sentToModel[0].tools, undefined, 'tools were offered for a site we cannot reach')
})

test('a tool that fails is reported to the model, not thrown away', async () => {
  const { sentToModel } = harness(
    [call('list_plugins'), say('نتوانستم افزونه‌ها را بخوانم.')],
    { toolFails: true },
  )

  const out = await assistant.answer({ ...SITE, authority: 'auto' }, 'افزونه‌ها؟')

  const toolMsg = sentToModel.at(-1).messages.find((m) => m.role === 'tool')
  assert.ok(toolMsg, 'the failure was not fed back to the model')
  assert.match(toolMsg.content, /connector timeout/)
  assert.equal(out.reply, 'نتوانستم افزونه‌ها را بخوانم.')
})

test('the answer reports which authority it acted under', async () => {
  harness([say('همه‌چیز خوب است.')])

  const out = await assistant.answer({ ...SITE, authority: 'confirm' }, 'وضعیت؟')

  assert.equal(out.authority, 'confirm')
})
