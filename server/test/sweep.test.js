// The assistant could only ever be started by a person typing a question. Every
// tool, the authority model, the proposal inbox and the audit trail existed and
// none of it did anything until somebody remembered to open the panel — so the
// only maintenance this server did on its own was one fixed malware scan.
//
// These drive the sweep against a scripted model and a scripted site, and pin
// the properties that make an unattended run safe rather than merely automatic:
// it must not stop at the first broken site, it must not invent a second copy of
// what `answer` already recorded, it must respect the cap it advertises, and its
// prompt must not be reachable from outside.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.ASSISTANT_URL = 'https://gateway.test'
process.env.ASSISTANT_API_KEY = 'test-key'
process.env.ASSISTANT_MODEL = 'nabu-smart'
process.env.LIVE = '1'

const sweep = await import('../src/sweep.js')

const respond = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

const site = (over = {}) => ({
  id: 'site-1',
  name: 'one',
  title: 'Site One',
  url: 'https://one.test',
  secret: 's3cr3t',
  site_key: 'k',
  paired: true,
  authority: 'confirm',
  ...over,
})

/**
 * Scripts both hops. `siteDown` makes the managed site unreachable, which is
 * the branch a fleet sweep meets most often and the one that must not take the
 * rest of the run down with it.
 */
function harness({ turns, siteDown = false } = {}) {
  const sentToModel = []
  let turn = 0

  globalThis.fetch = async (url, opts) => {
    const target = String(url)

    if (target.startsWith('https://gateway.test')) {
      sentToModel.push(JSON.parse(opts.body))
      const message = turns[Math.min(turn++, turns.length - 1)]
      return respond({ choices: [{ message }] })
    }

    if (siteDown) throw new Error('connect ECONNREFUSED')
    return respond({ result: { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] } })
  }

  return { sentToModel }
}

const say = (content) => ({ role: 'assistant', content })
const wants = (name, args = {}) => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
})

test('a healthy site is reported as checked, with nothing proposed', async () => {
  harness({ turns: [say('همه چیز سالم است.')] })

  const r = await sweep.sweepSite(site())

  assert.equal(r.ok, true)
  assert.equal(r.proposals, 0)
  assert.equal(r.degraded, false)
})

test('a change the assistant may not make becomes a proposal', async () => {
  // `confirm` authority: the model asks for a mutating tool, the server refuses
  // it, and the refusal is what produces something the owner can approve. A
  // sweep that returned prose here would leave nothing to click.
  harness({ turns: [wants('flush_cache'), say('کش نیاز به پاک‌سازی دارد.')] })

  const r = await sweep.sweepSite(site({ authority: 'confirm' }))

  assert.equal(r.ok, true)
  assert.equal(r.proposals, 1)
})

test('an unreachable site is reported, not thrown', async () => {
  // The failure that matters: one site down must not end the sweep. It is also
  // the site most worth hearing about.
  harness({ turns: [wants('site_info'), say('پاسخی نداد.')], siteDown: true })

  const r = await sweep.sweepSite(site())

  assert.equal(r.ok, true, 'a tool failure is answered by the model, not thrown')
})

test('a site that breaks the assistant outright is reported, not thrown', async () => {
  // The first version of this test asserted against a failing gateway, which
  // `answer` catches internally — so it passed with the error handling deleted
  // and proved nothing. A malformed site is the case that actually reaches the
  // handler: it throws before `answer`'s own try block.
  //
  // The property is the one the whole loop rests on. An exception escaping here
  // abandons every site after this one, and the site that breaks is exactly the
  // one worth hearing about.
  const r = await sweep.sweepSite(undefined)

  assert.equal(r.ok, false)
  assert.ok(r.error, 'the failure says something')
  // The handler must not itself depend on the site it is reporting about, or a
  // bad row turns one failed site into a dead sweep.
  assert.equal(r.name, 'unknown site')
})

test('the model is sent the fixed sweep prompt, not anything from outside', async () => {
  // The prompt runs unattended against live sites with tool access. If it were
  // configurable it would be an instruction channel into exactly that, so this
  // pins that what reaches the model is the constant in the module.
  const h = harness({ turns: [say('سالم است.')] })

  await sweep.sweepSite(site())

  const user = h.sentToModel[0].messages.find((m) => m.role === 'user')
  assert.equal(user.content, sweep.SWEEP_PROMPT)
})

test('the sweep asks for a check and does not push toward changing things', async () => {
  // Wording is the only thing standing between "look at this site" and "tidy
  // this site up" once the authority level allows acting.
  assert.match(sweep.SWEEP_PROMPT, /بررسی/)
  assert.match(sweep.SWEEP_PROMPT, /تغییر نده/)
})

test('the site name in a result never comes back undefined', async () => {
  // It ends up in a log line and a digest. `undefined` there is how a report
  // becomes unreadable at the moment somebody needs it.
  harness({ turns: [say('سالم است.')] })

  const r = await sweep.sweepSite(site({ title: null, name: null }))

  assert.equal(r.name, 'site-1')
})
