import { Router } from 'express'
import { sites, users } from '../store.js'
import * as events from '../events.js'
import { query } from '../db.js'

const router = Router()

router.get('/stats', async (req, res, next) => {
  try {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const [
      userCount,
      siteCount,
      pairedCount,
      openIncidents,
      events24h,
      events7d,
    ] = await Promise.all([
      users.count(),
      query('SELECT COUNT(*)::int AS n FROM sites').then((r) => r.rows[0].n),
      query('SELECT COUNT(*)::int AS n FROM sites WHERE paired = true').then((r) => r.rows[0].n),
      query("SELECT COUNT(*)::int AS n FROM events WHERE resolved_at IS NULL AND severity IN ('critical', 'warning')").then((r) => r.rows[0].n),
      query('SELECT COUNT(*)::int AS n FROM events WHERE created_at >= $1', [dayAgo]).then((r) => r.rows[0].n),
      query('SELECT COUNT(*)::int AS n FROM events WHERE created_at >= $1', [weekAgo]).then((r) => r.rows[0].n),
    ])
    res.json({
      users: userCount,
      sites: siteCount,
      pairedSites: pairedCount,
      openIncidents,
      events24h,
      events7d,
    })
  } catch (e) { next(e) }
})

router.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const search = req.query.search || ''
    const [list, total] = await Promise.all([
      users.listWithSiteCounts({ limit, offset, search }),
      users.count({ search }),
    ])
    res.json({ users: list, total, limit, offset })
  } catch (e) { next(e) }
})

router.get('/users/:id', async (req, res, next) => {
  try {
    const [user, userSites] = await Promise.all([
      users.byId(req.params.id),
      sites.listByUser(req.params.id),
    ])
    if (!user) return res.status(404).json({ message: 'کاربر پیدا نشد.' })
    res.json({ user, sites: userSites })
  } catch (e) { next(e) }
})

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ message: 'نمی‌توانید نقش خود را تغییر دهید.' })
    }
    const updated = await users.setRole(req.params.id, req.body.role)
    res.json(updated)
  } catch (e) { next(e) }
})

router.get('/events', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const filters = {
      userId: req.query.userId || null,
      siteId: req.query.siteId || null,
      kind: req.query.kind || null,
      severity: req.query.severity || null,
      from: req.query.from ? Number(req.query.from) : null,
      to: req.query.to ? Number(req.query.to) : null,
    }
    const [list, total] = await Promise.all([
      events.listAll(filters, limit, offset),
      events.countAll(filters),
    ])
    res.json({ events: list, total, limit, offset })
  } catch (e) { next(e) }
})

router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await events.byId(req.params.id)
    if (!event) return res.status(404).json({ message: 'رویداد پیدا نشد.' })
    res.json(event)
  } catch (e) { next(e) }
})

export default router
