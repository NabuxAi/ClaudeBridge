import { Router } from 'express'
import { signToken, verifyPassword, requireAuth } from '../auth.js'
import { users, httpError } from '../store.js'

const router = Router()

// Real registration — persists a hashed-password user.
router.post('/auth/register', (req, res, next) => {
  try {
    const { name, email, password } = req.body || {}
    const user = users.create({ name, email, password })
    res.status(201).json({ token: signToken({ sub: user.id, name: user.name }), user })
  } catch (e) { next(e) }
})

// Real login — verifies the password hash.
router.post('/auth/login', (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    const row = users.byEmailRaw(email)
    if (!row || !verifyPassword(password, row.pass_hash)) throw httpError(401, 'ایمیل یا رمز عبور نادرست است.')
    const user = users.byId(row.id)
    res.json({ token: signToken({ sub: user.id, name: user.name }), user })
  } catch (e) { next(e) }
})

// Current user from the session token.
router.get('/auth/me', requireAuth, (req, res) => {
  const user = users.byId(req.user.sub)
  if (!user) return res.status(401).json({ message: 'Unauthorized' })
  res.json(user)
})

export default router
