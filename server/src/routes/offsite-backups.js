import { Router } from 'express'
import { config } from '../config.js'
import { requireAuth } from '../auth.js'
import { sites } from '../store.js'
import { offsiteBackups } from '../offsite-backups.store.js'
import { runOffsiteBackup } from '../offsite-backups.runner.js'
import { limiter, clientIp } from '../security/ratelimit.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

async function loadSite(req, res) {
  const raw = await sites.rawForUser(req.params.id, req.user.sub)
  if (!raw) { res.status(404).json({ message: 'سایت یافت نشد.' }); return null }
  return raw
}

const targetLimit = limiter('offsite-target', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد تغییرات هدف بکاپ خارجی از این آدرس بیش از حد است.',
})

const jobLimit = limiter('offsite-job', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد شروع بکاپ خارجی از این آدرس بیش از حد است.',
})

// ---- Targets ---------------------------------------------------

router.get('/sites/:id/offsite-backups/targets', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    res.json({ targets: await offsiteBackups.listTargets(site.id) })
  } catch (e) { next(e) }
})

router.post('/sites/:id/offsite-backups/targets', targetLimit, async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const target = await offsiteBackups.create(site.id, req.body || {})
    res.status(201).json(target)
  } catch (e) { next(e) }
})

router.get('/sites/:id/offsite-backups/targets/:targetId', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const target = await offsiteBackups.getTarget(site.id, req.params.targetId)
    if (!target) return res.status(404).json({ message: 'هدف پشتیبان یافت نشد.' })
    res.json(target)
  } catch (e) { next(e) }
})

router.patch('/sites/:id/offsite-backups/targets/:targetId', targetLimit, async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const target = await offsiteBackups.update(site.id, req.params.targetId, req.body || {})
    res.json(target)
  } catch (e) { next(e) }
})

router.delete('/sites/:id/offsite-backups/targets/:targetId', targetLimit, async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    await offsiteBackups.remove(site.id, req.params.targetId)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ---- Jobs ------------------------------------------------------

router.get('/sites/:id/offsite-backups/jobs', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const jobs = await offsiteBackups.listJobs(site.id, { targetId: req.query.targetId })
    res.json({ jobs })
  } catch (e) { next(e) }
})

router.post('/sites/:id/offsite-backups/jobs', jobLimit, async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return

    const targetId = req.body?.targetId
    if (!targetId) return res.status(400).json({ message: 'targetId لازم است.' })

    const target = await offsiteBackups.getTarget(site.id, targetId)
    if (!target) return res.status(404).json({ message: 'هدف پشتیبان یافت نشد.' })

    if (!site.paired || !site.url || !site.secret) {
      return res.status(400).json({
        message: 'سایت هنوز به سرور ما وصل نشده — افزونهٔ واسط را نصب و جفت کنید.',
      })
    }
    if (!config.live) {
      return res.status(400).json({
        message: 'حالت زنده روی این سرور خاموش است (LIVE=1)، پس نمی‌توان فایل بکاپ را از سایت خواند.',
      })
    }

    const job = await offsiteBackups.createJob(site.id, targetId)

    // Start the upload in the background so the HTTP request returns
    // immediately. A database dump can take minutes; the UI polls /jobs.
    runOffsiteBackup(site, target, job.id).catch(() => {})

    res.status(202).json({ queued: true, job })
  } catch (e) { next(e) }
})

export default router
