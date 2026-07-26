import { Router } from 'express'
import { config, publicApiBase } from '../config.js'
import { sites } from '../store.js'
import { siteData } from '../seed.js'
import * as connector from '../connector.js'
import { describePolicy, policyForConnector } from '../policy.js'
import { PROVENANCE, updatesFromStatus } from '../live.js'

const router = Router()

const humanBytes = (n) => {
  if (!n) return '۰'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

// Load the site (owned by the signed-in user) or respond 404. Returns the raw row.
async function loadSite(req, res) {
  const raw = await sites.rawForUser(req.params.id, req.user.sub)
  if (!raw) { res.status(404).json({ message: 'سایت یافت نشد.' }); return null }
  return raw
}

function concern(name) {
  return async (req, res, next) => {
    try {
      const site = await loadSite(req, res)
      if (!site) return
      const data = siteData(req.params.id)[name]
      if (name === 'overview' && config.live && site.paired && site.url && site.secret) {
        try { data.live = await connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, 'site_info', {}) }
        catch (e) { data.liveError = e.message }
      }
      // Real scans for the security view (replace the seed when paired + live).
      //
      // Two independent layers, reported separately because they answer
      // different questions and fail differently:
      //
      //   integrity — is core byte-identical to what WordPress shipped?
      //               Cheap, decisive, and the only one that can prove a
      //               negative. An unexpected file in wp-includes is a finding
      //               on its own, no heuristics involved.
      //   scan      — does anything in wp-content look like a known shell?
      //               Heuristic, so it informs rather than proves.
      //
      // One failing must not hide the other, so each carries its own error.
      if (name === 'security' && config.live && site.paired && site.url && site.secret) {
        const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
        const unwrap = (raw) => {
          const text = raw?.content?.[0]?.text
          return typeof text === 'string' ? JSON.parse(text) : raw
        }
        const [scan, integrity] = await Promise.allSettled([
          connector.callTool(target, 'security_scan', {}),
          connector.callTool(target, 'core_integrity', {}),
        ])
        if (scan.status === 'fulfilled') {
          try { data.scan = unwrap(scan.value) } catch (e) { data.scanError = e.message }
        } else {
          data.scanError = scan.reason?.message || String(scan.reason)
        }
        if (integrity.status === 'fulfilled') {
          try { data.integrity = unwrap(integrity.value) } catch (e) { data.integrityError = e.message }
        } else {
          data.integrityError = integrity.reason?.message || String(integrity.reason)
        }

        // Cards built only from figures the site actually returned. There is
        // deliberately no composite "security score": one confident number
        // hides whether any of its inputs were measured, which is the failure
        // mode this whole pass exists to remove.
        data.metrics = []
        if (data.integrity?.ok) {
          data.metrics.push({
            label: 'فایل ناشناخته در هسته', value: String(data.integrity.unexpected.length),
            unit: '', icon: 'file-check-2',
            tone: data.integrity.unexpected.length ? 'danger' : 'success',
          })
          data.metrics.push({
            label: 'فایل تغییریافتهٔ هسته', value: String(data.integrity.modified.length),
            unit: '', icon: 'file-check-2',
            tone: data.integrity.modified.length ? 'warning' : 'success',
          })
        }
        if (data.scan) {
          data.metrics.push({
            label: 'یافتهٔ بدافزار', value: String(data.scan.hits?.length ?? 0),
            unit: '', icon: 'shield-check',
            tone: (data.scan.hits?.length ?? 0) ? 'danger' : 'success',
          })
          data.metrics.push({
            label: 'فایل اسکن‌شده', value: String(data.scan.scanned ?? 0),
            unit: '', icon: 'search', tone: 'neutral',
          })
        }
      }
      // Pending updates, straight from the site. This replaces the seed queue
      // entirely rather than decorating it — the seed listed plugins the site
      // may not even have installed.
      if (name === 'updates' && config.live && site.paired && site.url && site.secret) {
        try {
          const raw = await connector.callTool(
            { url: site.url, secret: site.secret, siteKey: site.site_key },
            'update_status',
            {}
          )
          const text = raw?.content?.[0]?.text
          const status = typeof text === 'string' ? JSON.parse(text) : raw
          const live = updatesFromStatus(status)
          if (live) {
            data.queue = live.queue
            data.done = live.done
            data.doneNote = live.doneNote
            data.wpVersion = live.wpVersion
            data.wpLatest = live.wpLatest
            data.phpVersion = live.phpVersion
            data.policy = live.policy
            data.checkedAt = live.checkedAt
          }
        } catch (e) { data.updatesError = e.message }
      }

      // Backups the site really holds. Built rather than declared missing:
      // the connector already had database and filesystem access, which is
      // everything a backup needs.
      if (name === 'backups' && config.live && site.paired && site.url && site.secret) {
        try {
          const raw = await connector.callTool(
            { url: site.url, secret: site.secret, siteKey: site.site_key }, 'backup_list', {}
          )
          const text = raw?.content?.[0]?.text
          const live = typeof text === 'string' ? JSON.parse(text) : raw
          if (live && Array.isArray(live.backups)) {
            data.list = live.backups.map((b) => ({
              id: b.id,
              when: new Date(b.created_at * 1000).toLocaleString('fa-IR'),
              type: b.label === 'scheduled' ? 'خودکار روزانه' : 'دستی',
              size: humanBytes(b.db_bytes + (b.files_bytes || 0)),
              // Verified means the dump ends the way a complete dump ends —
              // not that a backup file merely exists.
              verified: Boolean(b.verified),
              db: true,
              files: Boolean(b.files_file),
            }))
            data.totalSize = humanBytes(live.bytes)
            data.location = live.dir
            data.lastBackup = live.backups[0]
              ? new Date(live.backups[0].created_at * 1000).toLocaleString('fa-IR')
              : null
            data.empty = live.backups.length === 0
          }
        } catch (e) { data.backupsError = e.message }
      }

      // Say where this view's numbers come from — and, more importantly, which
      // of them have no source yet. A panel that cannot distinguish measured
      // from invented teaches people to trust none of it.
      if (PROVENANCE[name]) data.provenance = PROVENANCE[name]

      if (name === 'settings') {
        const c = site.connector || null
        data.connector = site.paired
          ? { paired: true, server: 'this server', lastSeen: c?.lastSeen, version: c?.version || '3.5.1' }
          : { paired: false }
        data.authority = site.authority
        // The three auto-update switches, each with whether safe mode is
        // currently holding it down, plus what the last run actually did.
        data.updatePolicy = describePolicy(site.policy)
        data.updateState = site.update_state || null
      }
      res.json(data)
    } catch (e) { next(e) }
  }
}

router.get('/sites/:id/overview', concern('overview'))
router.get('/sites/:id/incidents', concern('incidents'))
router.get('/sites/:id/updates', concern('updates'))
router.get('/sites/:id/security', concern('security'))
router.get('/sites/:id/backups', concern('backups'))
router.get('/sites/:id/settings', concern('settings'))

/**
 * Change the auto-update policy.
 *
 * The safe-mode lock is enforced in the store, not here, so it cannot be
 * bypassed by reaching the policy through some other route later. What this
 * endpoint adds is honesty: if the lock refused part of the request, the
 * response says which parts and why, rather than returning 200 and letting the
 * switch quietly spring back in the UI.
 *
 * The new policy is pushed to the site immediately when it is paired, so a
 * switch flipped in the panel takes effect now rather than at the next job.
 */
router.patch('/sites/:id/update-policy', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return

    const { policy, refused } = await sites.setPolicy(site.id, req.user.sub, req.body || {})

    let pushed = null
    if (site.paired && site.url && site.secret) {
      try {
        await connector.callTool(
          { url: site.url, secret: site.secret, siteKey: site.site_key },
          'set_update_policy',
          policyForConnector(policy)
        )
        pushed = true
      } catch (e) {
        // The policy is stored either way; the scheduled job will retry the
        // push. Saying "saved but not yet applied" beats failing the write.
        pushed = false
        res.set('X-Policy-Push-Error', String(e.message).slice(0, 120))
      }
    }

    res.json({
      ...describePolicy(policy),
      pushed,
      refused,
      message: refused.length
        ? 'حالت ایمنی روشن است؛ به‌روزرسانی خودکار خاموش نشد.'
        : null,
    })
  } catch (e) { next(e) }
})

/**
 * Rescue — recovering a site too compromised to trust any of its files.
 *
 * Exposed as separate steps rather than one button. Each is individually
 * runnable and individually stoppable, because a rescue that dies halfway and
 * leaves a site part-replaced is worse than one never started. The order the
 * panel walks is: backup, inventory, leftovers, db-audit, rotate-keys, verify.
 *
 * Only rotate-keys writes anything, and it demands its own confirm.
 */
const RESCUE_STEPS = {
  backup: { tool: 'backup_run', writes: true },
  inventory: { tool: 'rescue_inventory', writes: false },
  leftovers: { tool: 'rescue_leftovers', writes: false },
  'db-audit': { tool: 'rescue_db_audit', writes: false },
  'rotate-keys': { tool: 'rescue_rotate_keys', writes: true, confirm: true },
  verify: { tool: 'rescue_verify', writes: false },
}

router.post('/sites/:id/rescue/:step', async (req, res, next) => {
  try {
    const step = RESCUE_STEPS[req.params.step]
    if (!step) return res.status(404).json({ message: 'مرحلهٔ ناشناخته.' })

    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    // Key rotation logs every user out, including the owner. That is not
    // something to trigger from a mis-click.
    if (step.confirm && !req.body?.confirm) {
      return res.status(400).json({
        message: 'این مرحله همهٔ کاربران را از سایت خارج می‌کند. برای اجرا confirm=true بفرستید.',
      })
    }

    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      step.tool,
      req.body || {}
    )
    const text = raw?.content?.[0]?.text
    res.json({ step: req.params.step, result: typeof text === 'string' ? JSON.parse(text) : raw })
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * How much the assistant may do unattended.
 *
 * Enforced where it matters — the actions relay already refuses sensitive
 * commands regardless of level — but stored here so the panel's selector is
 * more than a decoration.
 */
router.patch('/sites/:id/authority', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const level = String(req.body?.authority || '')
    if (!['report', 'confirm', 'auto'].includes(level)) {
      return res.status(400).json({ message: 'سطح اختیار نامعتبر است.' })
    }
    const saved = await sites.setAuthority(site.id, req.user.sub, level)
    res.json({ authority: saved.authority })
  } catch (e) { next(e) }
})

router.get('/sites/:id/pairing', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    res.json({ siteKey: site.site_key, paired: !!site.paired, url: site.url, serverUrl: publicApiBase(req) })
  } catch (e) { next(e) }
})

// Live connection check via the signed /connector/ping.
router.post('/sites/:id/ping', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.url || !site.secret) return res.status(400).json({ message: 'سایت هنوز برای اتصال آماده نیست.' })
    try {
      const out = await connector.ping({ url: site.url, secret: site.secret, siteKey: site.site_key })
      await sites.markPaired(site.id, { version: out.version })
      res.json({ ok: true, connector: out })
    } catch (e) {
      res.status(e.status || 502).json({ ok: false, message: e.message })
    }
  } catch (e) { next(e) }
})

// A guarded action = a signed command relayed to the connector.
const SENSITIVE = new Set(['delete_plugin', 'activate_theme', 'edit_file', 'db_query', 'delete_file'])
router.post('/sites/:id/actions', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { action, tool, args = {}, approved } = req.body || {}
    const op = tool || action
    if (!op) return res.status(400).json({ message: 'action/tool لازم است.' })
    if (SENSITIVE.has(op) && !approved) {
      return res.status(202).json({ ok: false, requiresApproval: true, message: 'این اقدام حساس است و به تأیید شما نیاز دارد.' })
    }
    if (config.live && site.paired && site.url && site.secret) {
      try {
        const result = await connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, op, args)
        return res.json({ ok: true, relayed: true, result })
      } catch (e) {
        return res.status(e.status || 502).json({ ok: false, message: e.message })
      }
    }
    res.json({ ok: true, relayed: false, action: op, note: 'شبیه‌سازی — سایت به‌صورت زنده جفت نشده است.' })
  } catch (e) { next(e) }
})

router.post('/sites/:id/assistant', async (req, res, next) => {
  try {
    if (!(await loadSite(req, res))) return
    const { message } = req.body || {}
    res.json({
      reply: 'در ۲۴ ساعت گذشته سایت سالم بوده است. یک آپدیت پرریسک (Elementor) در صف تأیید شماست و فضای هاست به ۸۲٪ رسیده که پیشنهاد پاک‌سازی داده‌ام.',
      refs: ['گزارش امروز', 'صف آپدیت‌ها'], echo: message,
    })
  } catch (e) { next(e) }
})

export default router
