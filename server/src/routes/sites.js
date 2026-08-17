import { Router } from 'express'
import { config, publicApiBase } from '../config.js'
import { sites } from '../store.js'
import { siteData } from '../seed.js'
import * as connector from '../connector.js'
import { describePolicy, policyForConnector } from '../policy.js'
import { PROVENANCE, updatesFromStatus } from '../live.js'
import * as events from '../events.js'
import * as proposals from '../proposals.js'
import * as assistant from '../assistant.js'
import * as conversations from '../conversations.store.js'
import { isSensitive, SENSITIVE_SET } from '../authority.js'
import { probeSite } from '../probe.js'
import { analyse as analysePerf } from '../perf/recipes.js'
import { checkInventory, slugOf } from '../intel/vulns.js'
import { REGIONS, PROVIDERS, TRAITS, needsCacheBust } from '../hosting.js'
import { measureUrl } from '../speedtest.js'
import { offsiteBackups } from '../offsite-backups.store.js'
import { runOffsiteBackup } from '../offsite-backups.runner.js'

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
      // Overview, measured rather than seeded. Three sources, each of which
      // can fail without blanking the others: the connector for versions, an
      // HTTP+TLS probe from here for reachability and certificate life, and
      // the event log for what has actually happened.
      if (name === 'overview' && site.url) {
        const [info, checked, recent] = await Promise.allSettled([
          config.live && site.paired && site.secret
            ? connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, 'site_info', {})
            : Promise.resolve(null),
          probeSite(site.url, { cacheBust: needsCacheBust(site.hosting) }),
          events.list(site.id, 12),
        ])

        if (info.status === 'fulfilled' && info.value) {
          data.live = info.value
          const text = info.value?.content?.[0]?.text
          try { data.info = typeof text === 'string' ? JSON.parse(text) : info.value } catch { /* ignore */ }
        } else if (info.status === 'rejected') {
          data.liveError = info.reason?.message || String(info.reason)
        }

        if (checked.status === 'fulfilled' && checked.value) {
          const p = checked.value
          data.probe = p
          data.services = p.services
          data.status = p.reachable ? 'healthy' : 'down'
          data.metrics = []
          if (data.info?.wp_version) {
            data.metrics.push({ label: 'وردپرس', value: data.info.wp_version, unit: '', icon: 'boxes', tone: 'neutral' })
          }
          if (data.info?.php_version) {
            data.metrics.push({ label: 'PHP', value: data.info.php_version, unit: '', icon: 'code', tone: 'neutral' })
          }
          if (p.responseMs != null) {
            data.metrics.push({
              label: 'پاسخ همین حالا', value: String(p.responseMs), unit: 'ms', icon: 'gauge',
              tone: p.responseMs > 2000 ? 'warning' : 'primary',
            })
          }
          if (p.cert?.ok) {
            data.metrics.push({
              label: 'اعتبار SSL', value: String(p.cert.daysLeft), unit: 'روز', icon: 'lock',
              tone: p.cert.daysLeft < 14 ? 'danger' : p.cert.daysLeft < 30 ? 'warning' : 'success',
            })
          }
        } else {
          data.probeError = checked.reason?.message || 'بررسی انجام نشد'
        }

        // The activity feed, from the event log. What used to be here was a
        // fixed five-line story — "18 images compressed to WebP" and the like —
        // identical on every site and describing work nothing performs.
        if (recent.status === 'fulfilled') {
          data.report = recent.value.map((e) => ({
            icon: e.severity === 'critical' ? 'alert-octagon' : e.severity === 'warning' ? 'alert-triangle' : 'info',
            tone: e.resolved_at ? 'done' : e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'info',
            label: e.title,
            time: new Date(Number(e.created_at)).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
          }))
          data.reportEmpty = recent.value.length === 0
        }

        // Deliberately cleared: these were seeded numbers with no source.
        // `hostSpace` is not measurable from here at all, and one sample is
        // not an uptime.
        data.uptime = null
        data.hostSpace = null
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
        // Integrity is a bounded read — one manifest, a few thousand md5s — so
        // it can be awaited. The malware scan cannot: on a real site it walked
        // 28,568 files and blew straight through the relay timeout, which the
        // panel then reported as "tool security_scan failed". The job system
        // exists for exactly this, so the scan is queued and the last finished
        // result is what the view shows.
        const [scanState, integrity] = await Promise.allSettled([
          connector.callTool(target, 'job_status', { type: 'security_scan' }),
          connector.callTool(target, 'core_integrity', {}),
        ])

        if (scanState.status === 'fulfilled') {
          try {
            const job = unwrap(scanState.value)
            if (job?.state === 'done' && job.result) {
              data.scan = job.result
              data.scanAt = job.finished_at || null
            } else if (job?.state === 'running' || job?.state === 'queued') {
              data.scanJob = { id: job.id, state: job.state, progress: job.progress, message: job.message }
            } else {
              // Never scanned, so say that rather than showing an empty result
              // that reads like a clean bill of health.
              data.scanPending = true
            }
          } catch (e) { data.scanError = e.message }
        } else {
          data.scanError = scanState.reason?.message || String(scanState.reason)
        }
        if (integrity.status === 'fulfilled') {
          try { data.integrity = unwrap(integrity.value) } catch (e) { data.integrityError = e.message }
        } else {
          data.integrityError = integrity.reason?.message || String(integrity.reason)
        }

        // Known vulnerabilities in what is actually installed. This is what
        // the 7,998-row CVE table was built for — until now nothing read it.
        try {
          const [plugins, themes] = await Promise.all([
            connector.callTool(target, 'list_plugins', {}),
            connector.callTool(target, 'list_themes', {}),
          ])
          const inventory = []
          for (const p of unwrap(plugins)?.plugins || []) {
            inventory.push({ slug: slugOf(p.plugin), version: p.version, kind: 'plugin', name: p.name, active: p.active })
          }
          for (const t of unwrap(themes)?.themes || []) {
            inventory.push({ slug: t.stylesheet || t.slug, version: t.version, kind: 'theme', name: t.name, active: t.active })
          }
          data.vulns = await checkInventory(inventory)
        } catch (e) { data.vulnsError = e.message }

        // Security-relevant entries from the event log. This view used to say
        // event recording was not built; it is now, so it shows the real ones.
        try {
          const rows = await events.list(site.id, 12)
          data.events = rows
            .filter((e) => ['malware', 'action', 'rescue', 'scan_failed', 'policy'].includes(e.kind))
            .map((e) => ({
              icon: e.severity === 'critical' ? 'alert-octagon' : e.severity === 'warning' ? 'alert-triangle' : 'info',
              tone: e.resolved_at ? 'done' : e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'info',
              label: e.title,
              time: new Date(Number(e.created_at)).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
            }))
        } catch { /* the rest of the view still stands */ }

        // The certificate, from a real handshake rather than a claim.
        try {
          const probe = await probeSite(site.url, { cacheBust: needsCacheBust(site.hosting) })
          if (probe?.cert?.ok) {
            data.ssl = { days: probe.cert.daysLeft, issuer: probe.cert.issuer, expiresAt: probe.cert.expiresAt }
          } else {
            data.sslError = probe?.cert?.error || 'گواهی خوانده نشد'
          }
        } catch (e) { data.sslError = e.message }

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
        if (data.vulns) {
          data.metrics.push({
            label: 'آسیب‌پذیری شناخته‌شده', value: String(data.vulns.vulnerable.length),
            unit: '', icon: 'shield-alert',
            tone: data.vulns.vulnerable.length ? 'danger' : 'success',
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

      // Alerts, straight from the event log — the only view that used to have
      // no source at all. Everything below is something this system observed
      // or did; nothing is generated to make the page look inhabited.
      if (name === 'incidents') {
        const rows = await events.list(site.id, 60)
        data.list = rows.map(toIncident)
        data.featured = await featuredIncident(site.id, rows)
        data.empty = rows.length === 0
        // An empty log is not a clean bill of health, and the view has to be
        // able to say which it is. Sites are only observed when scanned, so
        // "nothing recorded" is the honest phrase.
        data.emptyNote = rows.length === 0
          ? 'هنوز رخدادی ثبت نشده. این یعنی چیزی مشاهده نشده، نه اینکه سایت قطعاً سالم بوده — سایت فقط هنگام اسکن دیده می‌شود.'
          : null
      }

      // A view that could not read the site must say so, not render empty.
      // The seed used to paper over this with invented numbers, which made an
      // unreachable site look healthier than a reachable one.
      if (!site.paired || !site.url || !site.secret) {
        if (['updates', 'security', 'backups'].includes(name)) {
          data.provenance = {
            live: [],
            unavailable: !site.url
              ? 'آدرس سایت ثبت نشده.'
              : 'سایت هنوز به سرور ما وصل نشده — افزونهٔ واسط را نصب و جفت کنید.',
          }
          return res.json(data)
        }
      } else if (!config.live && ['updates', 'security', 'backups'].includes(name)) {
        data.provenance = {
          live: [],
          unavailable: 'حالت زنده روی این سرور خاموش است (LIVE=1)، پس چیزی از سایت خوانده نمی‌شود.',
        }
        return res.json(data)
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

/** Relative Persian time. The log stores epoch ms; people read "۲ روز پیش". */
function faWhen(ms) {
  const diff = Date.now() - Number(ms)
  const min = Math.round(diff / 60000)
  if (min < 1) return 'همین حالا'
  if (min < 60) return `${faDigits(min)} دقیقه پیش`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${faDigits(hr)} ساعت پیش`
  const day = Math.round(hr / 24)
  if (day === 1) return 'دیروز'
  if (day < 31) return `${faDigits(day)} روز پیش`
  return new Date(Number(ms)).toLocaleDateString('fa-IR')
}

const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

/** One event as the alerts list renders it. */
function toIncident(ev) {
  return {
    id: ev.id,
    severity: ev.severity,
    title: ev.title,
    time: faWhen(ev.created_at),
    resolved: Boolean(ev.resolved_at),
    kind: ev.kind,
  }
}

/**
 * The one alert worth putting at the top, with its real history.
 *
 * Chosen as the oldest still-open critical: a problem that has been ignored
 * longest outranks one that appeared five minutes ago. If nothing is open,
 * there is no featured alert — an empty hero beats a manufactured one.
 */
async function featuredIncident(siteId, rows) {
  const open = rows.filter((r) => !r.resolved_at && r.severity === 'critical')
  if (!open.length) return null
  const ev = open[open.length - 1]

  const past = ev.fingerprint ? await events.history(siteId, ev.fingerprint) : [ev]
  const timeline = past.map((p) => ({
    t: new Date(Number(p.created_at)).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    label: p.resolved_at ? `${p.title} — برطرف شد` : p.title,
    tone: p.resolved_at ? 'done' : p.severity === 'critical' ? 'danger' : 'warning',
  }))

  const d = ev.detail || {}
  const fields = [
    { label: 'نوع', value: KIND_LABEL[ev.kind] || ev.kind },
    { label: 'اولین مشاهده', value: faWhen(ev.created_at) },
  ]
  if (d.file) fields.push({ label: 'فایل', value: d.file, mono: true })
  if (d.rule) fields.push({ label: 'قاعدهٔ منطبق', value: d.rule, mono: true })
  fields.push({ label: 'وضعیت', value: 'هنوز باز است', tone: 'danger' })

  return {
    id: ev.id,
    severity: ev.severity,
    title: ev.title,
    time: faWhen(ev.created_at),
    // Deliberately not "we fixed it": nothing here acts on its own. This
    // states what was seen and leaves the decision where it belongs.
    desc: 'این مورد در اسکن دیده شد و هنوز باز است. تا وقتی اسکن بعدی نبودنش را تأیید نکند، حل‌شده علامت نمی‌خورد.',
    fields,
    timeline,
  }
}

const KIND_LABEL = {
  malware: 'بدافزار',
  scan_failed: 'اسکن ناموفق',
  policy: 'تغییر سیاست',
  rescue: 'عملیات نجات',
  conflict: 'بررسی تداخل',
  action: 'اقدام حساس',
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

    // Worth a permanent record: this is the setting that decides whether the
    // site keeps itself patched, and "who turned it off, and when" is the first
    // question after a break-in.
    await events.record({
      siteId: site.id, kind: 'policy', severity: 'info',
      title: 'سیاست به‌روزرسانی تغییر کرد',
      detail: { policy, refused, pushed },
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
  // Queued: a database dump inside a request ties up a PHP worker for minutes,
  // which on a shared host means the customer's site is slow because we are
  // backing it up. job_status carries progress.
  backup: { tool: 'job_start', writes: true, job: 'backup' },
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

    const payload = step.job ? { ...(req.body || {}), type: step.job } : (req.body || {})
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      step.tool,
      payload
    )
    const text = raw?.content?.[0]?.text
    const result = typeof text === 'string' ? JSON.parse(text) : raw
    // A queued step returns a job id, not an outcome. Say which it is so the
    // panel knows whether to poll or to render.
    res.json({ step: req.params.step, queued: Boolean(step.job), result })

    // Recorded after responding: the operator should not wait on our bookkeeping,
    // and a failed write here must not turn a completed rescue step into an error.
    if (step.writes) {
      events.record({
        siteId: site.id, kind: 'rescue', severity: 'info',
        title: `عملیات نجات — مرحلهٔ «${req.params.step}» اجرا شد`,
        detail: { step: req.params.step, queued: Boolean(step.job) },
      }).catch(() => {})
    }
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

/**
 * Conflict hunt — find what breaks a page.
 *
 * This flips plugins and the theme on a LIVE site, so it is a POST with an
 * explicit URL rather than something that can happen by navigation. The
 * connector restores everything unconditionally, including on error.
 */
router.post('/sites/:id/conflict', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    if (!req.body?.url) {
      return res.status(400).json({ message: 'آدرس صفحهٔ خراب لازم است.' })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'conflict_hunt', url: req.body.url, expect: req.body.expect || '', forbid: req.body.forbid || '' }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })

    events.record({
      siteId: site.id, kind: 'conflict', severity: 'info',
      title: 'بررسی تداخل شروع شد',
      detail: { url: req.body.url },
    }).catch(() => {})
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Start a full malware scan.
 *
 * Queued, because on a real site it walks tens of thousands of files — the run
 * that exposed this took 28,568 — and no HTTP request should be held open for
 * that. The security view reads whatever the last finished run produced.
 */
router.post('/sites/:id/scan', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'security_scan' }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Measure what makes a page slow.
 *
 * Queued, because profiling deliberately slows the request it profiles —
 * SAVEQUERIES makes wpdb store a backtrace for every query — and because the
 * site-wide read walks the options table.
 */
router.post('/sites/:id/perf', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'perf', url: req.body?.url || '' }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Turn a finished profile into recipes.
 *
 * The matching runs here rather than on the site: the recipe book changes as
 * we learn more, and a rule improved today should apply to every site tonight
 * without anyone updating a plugin.
 */
router.post('/sites/:id/perf/analyse', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const profile = req.body?.profile
    if (!profile || typeof profile !== 'object') {
      return res.status(400).json({ message: 'گزارش سرعت لازم است.' })
    }
    res.json(analysePerf(profile))
  } catch (e) { next(e) }
})

/**
 * Run pending updates now.
 *
 * Queued: WordPress updates download, unpack and copy files, which is minutes
 * of work, not milliseconds. The site takes its own snapshot before the first
 * item and applies one item per pass so a single failure cannot strand the rest.
 */
router.post('/sites/:id/updates/run', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : undefined
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'update_apply', ...(items ? { items } : {}) }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })

    events.record({
      siteId: site.id, kind: 'update', severity: 'info',
      title: items?.length
        ? `به‌روزرسانی دستی ${items.length} مورد شروع شد`
        : 'به‌روزرسانی همهٔ موارد در صف شروع شد',
      detail: { items: items || 'all', by: req.user?.sub || null },
    }).catch(() => {})
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Take a snapshot now.
 *
 * Queued, not awaited: dumping a database inside a request holds a PHP worker
 * for minutes, which on shared hosting means the customer's own site is slow
 * because we are backing it up.
 */
router.get('/sites/:id/backups/preflight', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.json({
        ok: true,
        free_disk_bytes: 5 * 1024 * 1024 * 1024,
        free_disk_formatted: '۵.۰ GB',
        total_full_bytes: 280 * 1024 * 1024,
        total_full_formatted: '۲۸۰.۰ MB',
        total_full_duration: 35,
        can_full_backup: true,
        can_db_backup: true,
        sections: {
          db: { key: 'db', title: 'پایگاه داده (SQL)', description: 'جداول دیتابیس', bytes: 35 * 1024 * 1024, formatted: '۳۵.۰ MB', duration_sec: 5, required: true },
          plugins: { key: 'plugins', title: 'افزونه‌ها (Plugins)', description: 'پوشه wp-content/plugins', bytes: 85 * 1024 * 1024, formatted: '۸۵.۰ MB', duration_sec: 10, required: false },
          themes: { key: 'themes', title: 'قالب‌ها (Themes)', description: 'پوشه wp-content/themes', bytes: 20 * 1024 * 1024, formatted: '۲۰.۰ MB', duration_sec: 4, required: false },
          uploads: { key: 'uploads', title: 'رسانه‌ها و آپلودها (Uploads)', description: 'پوشه wp-content/uploads', bytes: 140 * 1024 * 1024, formatted: '۱۴۰.۰ MB', duration_sec: 16, required: false },
        },
      })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'backup_preflight',
      {}
    )
    const text = raw?.content?.[0]?.text
    const result = typeof text === 'string' ? JSON.parse(text) : raw
    res.json(result)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Take a snapshot now with granular section selection.
 */
router.post('/sites/:id/backups', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const sections = Array.isArray(req.body?.sections) && req.body.sections.length > 0
      ? req.body.sections
      : (req.body?.files ? ['db', 'plugins', 'themes', 'uploads'] : ['db'])
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'backup', files: sections.length > 1, sections, label: 'manual' }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })

    events.record({
      siteId: site.id, kind: 'backup', severity: 'info',
      title: 'بکاپ دستی شروع شد',
      detail: { sections, files: sections.length > 1 },
    }).catch(() => {})
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Restore a snapshot's database.
 *
 * The most destructive button in the product: it overwrites every table with
 * an older copy, so orders, comments and posts created since that snapshot are
 * gone. It demands its own confirm for the same reason key rotation does, and
 * the site takes its own pre-restore snapshot before replaying anything.
 */
router.post('/sites/:id/backups/:backupId/restore', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    if (!req.body?.confirm) {
      return res.status(400).json({
        message: 'بازگردانی، دیتابیس فعلی را با نسخهٔ قدیمی جایگزین می‌کند و هر تغییری پس از آن بکاپ از بین می‌رود. برای اجرا confirm=true بفرستید.',
      })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_start',
      { type: 'backup_restore', id: req.params.backupId }
    )
    const text = raw?.content?.[0]?.text
    res.json({ queued: true, job: typeof text === 'string' ? JSON.parse(text) : raw })

    events.record({
      siteId: site.id, kind: 'backup', severity: 'warning',
      title: `بازگردانی دیتابیس از بکاپ ${req.params.backupId} شروع شد`,
      detail: { backupId: req.params.backupId, by: req.user?.sub || null },
    }).catch(() => {})
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Stream a snapshot down to the browser.
 *
 * Pulled slice by slice from the site over the signed relay and written
 * straight to the response, so neither this server nor the site ever holds a
 * whole dump in memory — the file can be larger than either process's limit.
 * Nothing is cached on disk here either: a database dump at rest on the hub is
 * a liability that outlives the download.
 */
router.get('/sites/:id/backups/:backupId/download', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
    const what = req.query.what === 'files' ? 'files' : 'db'

    let offset = 0
    let headersSent = false
    for (let guard = 0; guard < 20000; guard++) {
      const raw = await connector.callTool(target, 'backup_read', {
        id: req.params.backupId, what, offset,
      })
      const text = raw?.content?.[0]?.text
      const part = typeof text === 'string' ? JSON.parse(text) : raw
      if (part?.error) throw new Error(part.error)

      if (!headersSent) {
        // Set once we know the file exists, so a missing backup is still a
        // clean JSON error rather than a truncated download.
        res.setHeader('Content-Type', what === 'files' ? 'application/zip' : 'application/sql')
        res.setHeader('Content-Disposition', `attachment; filename="${part.filename || 'backup'}"`)
        if (part.size) res.setHeader('Content-Length', String(part.size))
        headersSent = true
      }
      if (part.chunk) res.write(Buffer.from(part.chunk, 'base64'))
      if (part.eof) break
      // A slice that read nothing but is not eof would loop forever.
      if (!part.read) throw new Error('خواندن فایل متوقف شد')
      offset = part.offset + part.read
    }
    res.end()
  } catch (e) {
    if (res.headersSent) return res.destroy()
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Off-site cloud backup targets and sync jobs.
 */
router.get('/sites/:id/offsite/targets', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const targets = await offsiteBackups.listTargets(site.id)
    res.json({ targets })
  } catch (e) { next(e) }
})

router.post('/sites/:id/offsite/targets', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const target = await offsiteBackups.create(site.id, req.body)
    events.record({
      siteId: site.id, kind: 'policy', severity: 'info',
      title: 'مقصد پشتیبان‌گیری ابری جدید افزوده شد',
      detail: { endpoint: target.endpoint, bucket: target.bucket },
    }).catch(() => {})
    res.status(201).json(target)
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message })
  }
})

router.delete('/sites/:id/offsite/targets/:targetId', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    await offsiteBackups.remove(site.id, req.params.targetId)
    res.json({ ok: true })
  } catch (e) {
    res.status(e.status || 404).json({ message: e.message })
  }
})

router.get('/sites/:id/offsite/jobs', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const jobs = await offsiteBackups.listJobs(site.id, {
      targetId: req.query.targetId,
      limit: req.query.limit,
    })
    res.json({ jobs })
  } catch (e) { next(e) }
})

router.post('/sites/:id/offsite/sync', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }

    const targets = await offsiteBackups.listTargets(site.id)
    if (!targets.length) {
      return res.status(400).json({ message: 'هیچ مقصد پشتیبان ابری (S3) تنظیم نشده است.' })
    }

    const targetId = req.body?.targetId || targets[0].id
    const target = targets.find((t) => t.id === targetId) || targets[0]

    const job = await offsiteBackups.createJob(site.id, target.id)

    // Launch background upload runner
    runOffsiteBackup(site, target, job.id).catch((err) => {
      console.error('Offsite backup background runner error:', err)
    })

    events.record({
      siteId: site.id, kind: 'backup', severity: 'info',
      title: 'همگام‌سازی پشتیبان ابری شروع شد',
      detail: { targetId: target.id, jobId: job.id },
    }).catch(() => {})

    res.json({ queued: true, job })
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/** Progress of a queued job on the site. Cheap: reads an option, no scanning. */
router.get('/sites/:id/jobs/:jobId?', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({ message: 'سایت متصل نیست.' })
    }
    const raw = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      'job_status',
      req.params.jobId ? { id: req.params.jobId } : {}
    )
    const text = raw?.content?.[0]?.text
    res.json(typeof text === 'string' ? JSON.parse(text) : raw)
  } catch (e) {
    res.status(e.status || 502).json({ message: e.message })
  }
})

/**
 * Dismiss an alert.
 *
 * Closes the event without touching the site. Named honestly in the panel as
 * "ignore" rather than "resolve": the condition may well still be there, and a
 * button that silently claims otherwise is how a compromised site ends up
 * looking clean. A later scan that still sees the problem reopens it, because
 * the fingerprint's open row is gone and record() will insert a fresh one.
 */
router.post('/sites/:id/incidents/:eventId/dismiss', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const ok = await events.resolveOne(site.id, req.params.eventId)
    if (!ok) return res.status(404).json({ message: 'رخداد باز با این شناسه پیدا نشد.' })
    await events.record({
      siteId: site.id, kind: 'action', severity: 'info',
      title: 'یک هشدار دستی نادیده گرفته شد',
      detail: { eventId: req.params.eventId, by: req.user?.sub || null },
    })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

/**
 * Where this site is hosted.
 *
 * Merged, not replaced — a panel that sends only `callbackUrl` must not blank
 * the region someone chose last week. Changing the callback address does not
 * require re-pairing: the connector is handed the new one the next time it
 * reads /pairing.
 */
router.patch('/sites/:id/hosting', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const updated = await sites.setHosting(site.id, req.user.sub, req.body || {})

    events.record({
      siteId: site.id, kind: 'policy', severity: 'info',
      title: 'تنظیمات میزبانی سایت تغییر کرد',
      detail: { hosting: updated.hosting, by: req.user?.sub || null },
    }).catch(() => {})

    res.json({ hosting: updated.hosting, serverUrl: publicApiBase(req, updated) })
  } catch (e) { next(e) }
})

/** The choices the panel offers, with what each one actually changes. */
router.get('/hosting/options', (_req, res) => {
  res.json({ regions: REGIONS, providers: PROVIDERS, traits: TRAITS })
})

router.get('/sites/:id/pairing', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    res.json({
      siteKey: site.site_key,
      paired: !!site.paired,
      url: site.url,
      // Resolved per site: its own callback URL, then its region's, then the
      // server default. Re-reading this endpoint is how an already-paired site
      // is moved to a different address.
      serverUrl: publicApiBase(req, { hosting: site.hosting }),
    })
  } catch (e) { next(e) }
})

// Speed test: the server fetches the site and measures TTFB/total/size.
router.post('/sites/:id/speedtest', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.url) return res.status(400).json({ message: 'سایت آدرسی ندارد.' })
    const samples = Math.min(5, Math.max(1, Number(req.body?.samples) || 3))
    res.json(await measureUrl(site.url, samples))
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
//
// The set lives in authority.js so this route and the assistant enforce one
// policy rather than two that must be kept in step by hand.
const SENSITIVE = SENSITIVE_SET
/**
 * What is still waiting for a human on this site.
 *
 * Without this the approve button only existed for as long as the answer was on
 * screen: proposals lived in the panel's React state, so a refresh lost them and
 * nobody who was not in the conversation could ever act on one.
 */
router.get('/sites/:id/proposals', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    res.json({ proposals: await proposals.pending(site.id) })
  } catch (e) { next(e) }
})

/** Decline a proposal. It keeps the row: who said no is worth knowing too. */
router.post('/sites/:id/proposals/:proposalId/reject', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const rejected = await proposals.resolve(site.id, req.params.proposalId, 'rejected', {
      by: req.user?.sub,
    })
    if (!rejected) {
      return res.status(409).json({ ok: false, message: 'این پیشنهاد پیش‌تر تعیین تکلیف شده است.' })
    }
    res.json({ ok: true, proposal: rejected })
  } catch (e) { next(e) }
})

router.post('/sites/:id/actions', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { action, tool, args = {}, approved, proposalId } = req.body || {}
    const op = tool || action
    if (!op) return res.status(400).json({ message: 'action/tool لازم است.' })
    // isSensitive rather than the name-only Set: job_start is one tool covering
    // seven jobs, and update_apply / backup_restore are sensitive while a scan
    // is not. A name-only check let the dangerous two through as merely
    // mutating the moment they became reachable from the tool schema.
    if (isSensitive(op, args) && !approved) {
      return res.status(202).json({ ok: false, requiresApproval: true, message: 'این اقدام حساس است و به تأیید شما نیاز دارد.' })
    }

    // Approving a stored proposal claims it BEFORE the tool runs. The UPDATE
    // matches only while the row is still pending, so two people clicking
    // approve at the same moment produce one execution and one 409 — rather
    // than two identical changes to the site, which is the failure an approval
    // queue exists to prevent.
    let claimed = null
    if (proposalId) {
      claimed = await proposals.resolve(site.id, proposalId, 'approved', { by: req.user?.sub })
      if (!claimed) {
        return res.status(409).json({
          ok: false,
          message: 'این پیشنهاد پیش‌تر تعیین تکلیف شده است.',
        })
      }
    }
    if (config.live && site.paired && site.url && site.secret) {
      try {
        const result = await connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, op, args)
        // Sensitive ops are the ones that changed the site. They belong in the
        // log whether a human approved them or the assistant ran them under
        // standing authority — "nobody remembers doing that" is exactly what
        // an audit trail is for.
        if (SENSITIVE.has(op)) {
          events.record({
            siteId: site.id, kind: 'action', severity: 'warning',
            title: `اقدام حساس اجرا شد: ${op}`,
            detail: { op, args, approved: Boolean(approved) },
          }).catch(() => {})
        }
        if (claimed) {
          proposals.recordOutcome(site.id, claimed.id, { ok: true, at: Date.now() }).catch(() => {})
        }
        return res.json({ ok: true, relayed: true, result })
      } catch (e) {
        // The proposal was claimed before the tool ran, so at this point it
        // reads "approved" while the site was never changed. Without this the
        // queue shows a decision that was carried out — which is what approved
        // has always meant here — and nothing anywhere says it failed.
        if (claimed) {
          proposals.recordOutcome(site.id, claimed.id, {
            ok: false, at: Date.now(), error: e.message,
          }).catch(() => {})
          events.record({
            siteId: site.id, kind: 'action', severity: 'warning',
            title: `اقدام تأییدشده اجرا نشد: ${op}`,
            detail: { op, args, proposalId: claimed.id, error: e.message },
            // Tied to the proposal so this sits with the decision it belongs
            // to rather than becoming a loose alert nobody can place.
            fingerprint: `proposal-failed:${claimed.id}`,
          }).catch(() => {})
        }
        return res.status(e.status || 502).json({ ok: false, message: e.message })
      }
    }
    res.json({ ok: true, relayed: false, action: op, note: 'شبیه‌سازی — سایت به‌صورت زنده جفت نشده است.' })
  } catch (e) { next(e) }
})

router.post('/sites/:id/assistant', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { message, maxToolSteps } = req.body || {}
    res.json(await assistant.answer(site, message, { maxToolSteps }))
  } catch (e) { next(e) }
})

// ---- Assistant Persistent Conversations -----------------------

router.get('/sites/:id/conversations', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const list = await conversations.list(site.id)
    res.json({ conversations: list })
  } catch (e) { next(e) }
})

router.post('/sites/:id/conversations', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { title } = req.body || {}
    const created = await conversations.create(site.id, req.user?.sub, title)
    res.status(201).json(created)
  } catch (e) { next(e) }
})

router.get('/sites/:id/conversations/:convId', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const conv = await conversations.get(site.id, req.params.convId)
    if (!conv) return res.status(404).json({ message: 'گفتگو یافت نشد.' })
    res.json(conv)
  } catch (e) { next(e) }
})

router.patch('/sites/:id/conversations/:convId', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { title, status } = req.body || {}
    const updated = await conversations.update(site.id, req.params.convId, { title, status })
    if (!updated) return res.status(404).json({ message: 'گفتگو یافت نشد.' })
    res.json(updated)
  } catch (e) { next(e) }
})

router.delete('/sites/:id/conversations/:convId', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const ok = await conversations.deleteConv(site.id, req.params.convId)
    if (!ok) return res.status(404).json({ message: 'گفتگو یافت نشد.' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

router.post('/sites/:id/conversations/:convId/messages', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { message, maxToolSteps, waitForReply = true } = req.body || {}
    const result = await conversations.postAndProcess(site, req.params.convId, message, {
      userId: req.user?.sub,
      maxToolSteps,
    })

    if (waitForReply && result.backgroundPromise) {
      // Wait up to 30s so the client receives the reply directly if it stays on the page
      await Promise.race([
        result.backgroundPromise,
        new Promise((r) => setTimeout(r, 29000)),
      ])
      const fullConv = await conversations.get(site.id, req.params.convId)
      return res.json(fullConv)
    }

    res.status(202).json({
      status: 'processing',
      userMessage: result.userMessage,
      conversationId: req.params.convId,
    })
  } catch (e) { next(e) }
})

export default router
