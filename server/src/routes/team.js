import { Router } from 'express'
import { team } from '../store.js'
import { config } from '../config.js'
import { limiter, clientIp } from '../security/ratelimit.js'

const router = Router()
const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

const inviteLimit = limiter('team-invite', {
  limit: 10, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد دعوت‌ها از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

/**
 * List members and pending invitations for a site.
 *
 * Only the site owner can manage members; the list itself is also owner-only
 * until a read-only view for non-owners is designed.
 */
router.get('/sites/:id/team', async (req, res, next) => {
  try {
    res.json(await team.list(req.params.id, req.user.sub))
  } catch (e) { next(e) }
})

/**
 * Invite someone to a site by email.
 *
 * Returns the public invitation and whether an email was accepted by the
 * provider. The raw token is returned here for testability and for callers that
 * want to embed it in a custom email; it is hashed in storage and never exposed
 * in list responses.
 */
router.post('/sites/:id/team/invitations', inviteLimit, async (req, res, next) => {
  try {
    const { email, role } = req.body || {}
    const result = await team.invite(req.params.id, req.user.sub, { email, role })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

/**
 * Accept an invitation.
 *
 * Requires authentication: the signed-in user's email must match the invited
 * address. A future onboarding flow can register a new user first and then call
 * this with the same token.
 */
router.post('/team/invitations/accept', async (req, res, next) => {
  try {
    const { siteId, token } = req.body || {}
    if (!siteId || !token) {
      return res.status(400).json({ message: 'شناسهٔ سایت و توکن دعوت لازم است.' })
    }
    const member = await team.accept(siteId, token, req.user.sub)
    res.status(201).json(member)
  } catch (e) { next(e) }
})

/** Revoke a pending invitation. */
router.delete('/sites/:id/team/invitations/:invitationId', async (req, res, next) => {
  try {
    res.json(await team.revoke(req.params.id, req.user.sub, req.params.invitationId))
  } catch (e) { next(e) }
})

/** Update a member's role. */
router.patch('/sites/:id/team/members/:memberId', async (req, res, next) => {
  try {
    const { role } = req.body || {}
    res.json(await team.updateRole(req.params.id, req.user.sub, req.params.memberId, role))
  } catch (e) { next(e) }
})

/** Remove a member from the site. */
router.delete('/sites/:id/team/members/:memberId', async (req, res, next) => {
  try {
    res.json(await team.removeMember(req.params.id, req.user.sub, req.params.memberId))
  } catch (e) { next(e) }
})

export default router
