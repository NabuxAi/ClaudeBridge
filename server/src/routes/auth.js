import { Router } from 'express'
import { signToken } from '../auth.js'
import { demoUser } from '../seed.js'

const router = Router()
const publicUser = ({ password, ...u }) => u

// Demo auth — accepts the seed user, or any credentials in demo mode.
router.post('/auth/login', (req, res) => {
  const { email } = req.body || {}
  const user = { ...demoUser, email: email || demoUser.email }
  res.json({ token: signToken({ sub: user.id, name: user.name }), user: publicUser(user) })
})

router.post('/auth/register', (req, res) => {
  const { name, email } = req.body || {}
  const user = { ...demoUser, name: name || demoUser.name, email: email || demoUser.email }
  res.json({ token: signToken({ sub: user.id, name: user.name }), user: publicUser(user) })
})

router.get('/auth/me', (req, res) => res.json(publicUser(demoUser)))

export default router
