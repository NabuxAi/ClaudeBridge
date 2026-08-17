import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { notifications } from '../notifications.store.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { config } from '../config.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

/**
 * Current notification preferences for the signed-in user.
 *
 * Returns every channel the dispatcher knows about, merged with whatever the
 * user has saved. A channel that has never been configured is returned with
 * enabled=false and null quiet hours so the UI can render it honestly.
 */
router.get('/notifications/preferences', requireAuth, async (req, res, next) => {
  try {
    res.json({ channels: await notifications.getPreferences(req.user.sub) })
  } catch (e) { next(e) }
})

/**
 * Save preferences for one channel.
 *
 * This is a full overwrite of the user's preference for that channel: sending
 * null destination clears it. The server validates quiet hours and channel id.
 */
router.put('/notifications/preferences/:channel', requireAuth, async (req, res, next) => {
  try {
    const { enabled, destination, quietHoursStart, quietHoursEnd } = req.body || {}
    const saved = await notifications.setPreference(req.user.sub, req.params.channel, {
      enabled, destination, quietHoursStart, quietHoursEnd,
    })
    res.json(saved)
  } catch (e) { next(e) }
})

/**
 * Contacts enrolled by the signed-in user.
 */
router.get('/notifications/contacts', requireAuth, async (req, res, next) => {
  try {
    res.json({ contacts: await notifications.listContacts(req.user.sub) })
  } catch (e) { next(e) }
})

const contactLimit = limiter('contact-enroll', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'ثبت مخاطب از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

/**
 * Enroll a new contact (email, SMS number, push token).
 *
 * Rate-limited per IP: this is the endpoint an attacker with a stolen session
 * could abuse to spam addresses or numbers. Normalising the value here keeps
 * duplicates out and keeps the dispatcher from guessing formats.
 */
router.post('/notifications/contacts', requireAuth, contactLimit, async (req, res, next) => {
  try {
    const { type, value } = req.body || {}
    if (!type || !value) return res.status(400).json({ message: 'نوع و مقدار تماس لازم است.' })
    const contact = await notifications.addContact(req.user.sub, type, value)
    res.status(201).json(contact)
  } catch (e) { next(e) }
})

/**
 * Delete an enrolled contact. Only the owning user can delete it.
 */
router.delete('/notifications/contacts/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await notifications.deleteContact(req.user.sub, req.params.id)
    res.json(result)
  } catch (e) { next(e) }
})

/**
 * Mark a contact as verified.
 *
 * In a real email/SMS verification flow this would be called after the owner
 * proves control with a token. For now it is an explicit management action,
 * still scoped to the owning user, so the UI can show "verified" state and the
 * dispatcher can decide whether to trust the contact.
 */
router.post('/notifications/contacts/:id/verify', requireAuth, async (req, res, next) => {
  try {
    const contact = await notifications.verifyContact(req.user.sub, req.params.id)
    res.json(contact)
  } catch (e) { next(e) }
})

export default router
