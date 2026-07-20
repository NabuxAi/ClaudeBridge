// ============================================================
// DigiWP Ai Support — the واسط server.
// Sits between the hub UI and the WP Claude Bridge connectors.
// The hub only ever talks to THIS server; this server is the only
// thing that (HMAC-signed) talks to the managed sites' connectors.
// ============================================================
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { requireAuth } from './auth.js'
import { init as initDb } from './db.js'
import authRouter from './routes/auth.js'
import accountRouter from './routes/account.js'
import sitesRouter from './routes/sites.js'
import connectorRouter from './routes/connector.js'

const app = express()
app.set('trust proxy', true) // behind Coolify/Traefik/nginx — honor X-Forwarded-Proto/Host
app.use(cors({ origin: config.corsOrigin }))
// Capture the raw body so we can HMAC-verify inbound connector requests.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8') } }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'digiwp-server', live: config.live }))

// Public: hub auth + the plugin's signed register receiver.
app.use('/v1', authRouter)
app.use('/v1', connectorRouter)
// Protected: everything the hub reads after login.
app.use('/v1', requireAuth, accountRouter)
app.use('/v1', requireAuth, sitesRouter)

app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err)
  res.status(err.status || 500).json({ message: err.message || 'server error' })
})

// Connect + migrate + seed before accepting traffic.
initDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`DigiWP server on :${config.port}  (Postgres, live relay: ${config.live ? 'on' : 'off'})`)
    })
  })
  .catch((e) => {
    console.error('Failed to initialise the database:', e.message)
    process.exit(1)
  })

export default app
