// Background and content-producing text follows the reader's language.
//
// The rule these pin: English when nobody asked for anything else, Persian
// when the request (Accept-Language) or the recipient (users.lang) says so —
// and the honesty caveats survive the translation in both.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

import { renderBriefing } from '../src/assistant.js'
import { describePolicy } from '../src/policy.js'
import { updatesFromStatus } from '../src/live.js'
import { i18nTitle } from '../src/events.js'
import { localizeCheckError } from '../src/monitors.runner.js'
import { localizeJobError } from '../src/offsite-backups.runner.js'
import { renderDigest } from '../src/digest.js'
import sitesRouter from '../src/routes/sites.js'

async function getJson(app, path, headers = {}) {
  const server = app.listen(0)
  try {
    const { port } = server.address()
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers })
    return { status: res.status, body: await res.json() }
  } finally {
    server.close()
  }
}

test('GET /hosting/options is English by default and Persian with Accept-Language: fa', async () => {
  const app = express()
  app.use('/v1', sitesRouter)

  const en = await getJson(app, '/v1/hosting/options')
  assert.equal(en.status, 200)
  assert.equal(en.body.regions.find((r) => r.id === 'ir').label, 'Iran')
  assert.equal(en.body.providers.find((p) => p.id === 'other').label, 'Something else')

  const fa = await getJson(app, '/v1/hosting/options', { 'Accept-Language': 'fa-IR,fa;q=0.9' })
  assert.equal(fa.body.regions.find((r) => r.id === 'ir').label, 'ایران')
  assert.equal(fa.body.providers.find((p) => p.id === 'other').label, 'موردی غیر از این‌ها')
})

test('the no-model briefing reads in the reader\'s language and still names its gaps', () => {
  const facts = {
    site: { wp: '6.6.2', php: '8.2' },
    updates: { pending: 2, items: ['akismet → 5.7'], wpVersion: '6.6.2', wpLatest: '6.7' },
    openAlerts: [],
    backups: { count: 1, last: 'yesterday', verified: false },
  }
  const en = renderBriefing(facts)
  assert.match(en, /The site runs on WordPress 6\.6\.2 and PHP 8\.2\./)
  assert.match(en, /2 updates are queued, including akismet/)
  assert.match(en, /its completeness has not been verified/)

  const fa = renderBriefing(facts, 'fa')
  assert.match(fa, /سایت روی وردپرس 6\.6\.2 و PHP 8\.2 است\./)
  assert.match(fa, /۲ به‌روزرسانی در صف است/)
  assert.match(fa, /کامل بودنش تأیید نشده/)
})

test('the safe-mode lock never promises a rollback, in either language', () => {
  const en = describePolicy({ safeMode: true })
  assert.match(en.lockReason, /does not give automatic rollback/)
  assert.equal(en.switches[0].label, 'Automatic WordPress core updates')
  const fa = describePolicy({ safeMode: true }, 'fa')
  assert.match(fa.lockReason, /rollback کامل فایل هنوز ساخته نشده است/)
})

test('update risk labels are translated while risk codes stay machine-readable', () => {
  const status = { core_outdated: true, wp_version: '6.6', wp_latest: '7.0', plugins_pending: [{ name: 'x', from: '1.0.0', to: '1.0.1' }] }
  const en = updatesFromStatus(status)
  assert.equal(en.queue[0].risk, 'high')
  assert.equal(en.queue[0].riskLabel, 'New major version')
  assert.equal(en.queue[0].kind, 'core')
  const fa = updatesFromStatus(status, 'fa')
  assert.equal(fa.queue[0].riskLabel, 'نسخهٔ اصلی جدید')
  assert.equal(fa.queue[1].type, 'افزونه')
})

test('stored event titles are English with the key beside them', () => {
  const e = i18nTitle('events.scan.infectedFile', { file: 'x.php' }, { file: 'x.php' })
  assert.equal(e.title, 'Infected file found: x.php')
  assert.deepEqual(e.detail.i18n, { key: 'events.scan.infectedFile', vars: { file: 'x.php' } })
  // A plugin report that is not an object is kept as it was.
  assert.equal(i18nTitle('events.scan.robotsTampered', {}, 'raw text').detail, 'raw text')
})

test('stored runner errors render per viewer, including pre-translation Persian rows', () => {
  assert.match(localizeCheckError('fa', 'No response within the 10-second limit.'), /مهلت ۱۰ ثانیه/)
  assert.equal(localizeCheckError('en', 'پاسخی در مهلت ۱۰ ثانیه نرسید.'), 'No response within the 10-second limit.')
  assert.equal(localizeCheckError('fa', 'connect ECONNREFUSED'), 'connect ECONNREFUSED')
  assert.equal(localizeJobError('fa', 'No backup was found on the site.'), 'هیچ بکاپی روی سایت یافت نشد.')
})

test('the operator digest follows the operator locale', () => {
  const results = [{ name: 'a.example', ok: true, critical: 0, suspicious: 1, findings: [] }]
  assert.match(renderDigest(results), /Daily security report/)
  assert.match(renderDigest(results, 'fa'), /گزارش امنیتی روزانه/)
  assert.match(renderDigest([]), /No paired sites\./)
})
