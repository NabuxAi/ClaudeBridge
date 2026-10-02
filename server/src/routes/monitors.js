import { Router } from 'express'
import { config } from '../config.js'
import { requireAuth } from '../auth.js'
import { sites } from '../store.js'
import { monitors, SCOPE_LABEL, PER_SITE_LIMIT } from '../monitors.store.js'
import { checkMonitor } from '../monitors.runner.js'
import { limiter, clientIp } from '../security/ratelimit.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

// Same membership layer as routes/sites.js and routes/offsite-backups.js:
// owner or active team member may read; only the owner may change anything.
// The 403 fires BEFORE route-specific 400s so a member probing gets no
// different error map than the owner.
async function loadSite(req, res) {
  const owned = await sites.rawForUser(req.params.id, req.user.sub)
  if (owned) {
    req.siteRole = 'owner'
    return owned
  }
  const row = await sites.rawWithRole(req.params.id, req.user.sub)
  if (!row || !row.member_role) {
    res.status(404).json({ message: 'سایت یافت نشد.' })
    return null
  }
  const { member_role: role, ...raw } = row
  req.siteRole = role
  return raw
}

async function loadOwnerSite(req, res) {
  const site = await loadSite(req, res)
  if (!site) return null
  if (req.siteRole !== 'owner') {
    res.status(403).json({
      message: 'این اقدام فقط برای مالک سایت مجاز است؛ اعضای تیم در حال حاضر فقط دسترسی مشاهده دارند.',
    })
    return null
  }
  return site
}

const writeLimit = limiter('monitor-write', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد تغییرات مانیتورها از این آدرس بیش از حد است.',
})

const checkLimit = limiter('monitor-check', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد بررسی‌های دستی مانیتور از این آدرس بیش از حد است.',
})

// ---- Monitors --------------------------------------------------

router.get('/sites/:id/monitors', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    // Site-wide totals ride along so the panel renders «دسترس‌پذیری ۷/۳۰ روزه»
    // from one call; per-monitor windows are on each row below.
    const [list, availability] = await Promise.all([
      monitors.list(site.id),
      monitors.siteAvailability(site.id),
    ])
    res.json({
      monitors: list,
      availability,
      scope: SCOPE_LABEL,
      limit: PER_SITE_LIMIT,
    })
  } catch (e) { next(e) }
})

router.post('/sites/:id/monitors', writeLimit, async (req, res, next) => {
  try {
    const site = await loadOwnerSite(req, res)
    if (!site) return
    const monitor = await monitors.create(site.id, req.body || {})
    res.status(201).json(monitor)
  } catch (e) { next(e) }
})

router.patch('/sites/:id/monitors/:monitorId', writeLimit, async (req, res, next) => {
  try {
    const site = await loadOwnerSite(req, res)
    if (!site) return
    const monitor = await monitors.update(site.id, req.params.monitorId, req.body || {})
    res.json(monitor)
  } catch (e) { next(e) }
})

router.delete('/sites/:id/monitors/:monitorId', writeLimit, async (req, res, next) => {
  try {
    const site = await loadOwnerSite(req, res)
    if (!site) return
    await monitors.remove(site.id, req.params.monitorId)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// Recent attempts of one monitor — successes and failures alike, because a
// results list that only ever shows successes is a scoreboard, not a history.
router.get('/sites/:id/monitors/:monitorId/results', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const monitor = await monitors.get(site.id, req.params.monitorId)
    if (!monitor) return res.status(404).json({ message: 'مانیتور یافت نشد.' })
    res.json({
      results: await monitors.listResults(site.id, monitor.id, { limit: req.query.limit }),
      scope: SCOPE_LABEL,
    })
  } catch (e) { next(e) }
})

// Run one check now, and answer with the recorded attempt — the same row the
// scheduler would have written, so a manual check is evidence, not decoration.
// POST, and owner-only like every other non-GET site route: each run makes
// this server fire a request at the URL, which is not "reading".
router.post('/sites/:id/monitors/:monitorId/check', checkLimit, async (req, res, next) => {
  try {
    const site = await loadOwnerSite(req, res)
    if (!site) return
    const monitor = await monitors.get(site.id, req.params.monitorId)
    if (!monitor) return res.status(404).json({ message: 'مانیتور یافت نشد.' })
    const result = await checkMonitor(monitor)
    res.json({ result, scope: SCOPE_LABEL })
  } catch (e) { next(e) }
})

export default router
