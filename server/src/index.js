// ============================================================
// DigiWP Ai Support — the واسط server.
// Sits between the hub UI and the WP Claude Bridge connectors.
// The hub only ever talks to THIS server; this server is the only
// thing that (HMAC-signed) talks to the managed sites' connectors.
// ============================================================
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { requireAuth, assertSecretIsReal } from './auth.js'
import { init as initDb } from './db.js'
import authRouter from './routes/auth.js'
import accountRouter from './routes/account.js'
import cookbookRouter from './routes/cookbook.js'
import sitesRouter from './routes/sites.js'
import connectorRouter from './routes/connector.js'
import { runDailyDigest, scheduleDailyDigest } from './digest.js'
import { initIntel, scheduleIntel, refresh as refreshIntel } from './intel/index.js'

// Before anything binds a port: a server running on the development signing
// secret will happily accept a session token anyone reading this repository
// can mint.
assertSecretIsReal()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', config.trustProxy) // behind Coolify/Traefik/nginx — honor X-Forwarded-Proto/Host
app.use(cors({ origin: config.corsOrigin }))

/**
 * Response headers.
 *
 * This is an API, not a page, so the set is short and every entry earns its
 * place. nosniff stops a browser from deciding a JSON error is HTML and
 * running it; DENY stops the panel being framed by a lookalike that captures
 * clicks; no-referrer keeps site URLs and pairing paths out of the Referer
 * header when a response links anywhere. HSTS is set only when the request
 * actually arrived over TLS — sending it on plain HTTP is meaningless and
 * would break local development.
 */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  // An API returns data, never markup — so nothing here should ever be able to
  // load a script, and saying so costs nothing.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  if (req.secure || req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
})

// Capture the raw body so we can HMAC-verify inbound connector requests.
// Bounded: without a limit, one request with a huge body is a memory exhaustion
// attack, and no legitimate call here is anywhere near this size.
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8') },
}))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'digiwp-server', live: config.live }))

// Public: hub auth + the plugin's signed register receiver.
app.use('/v1', authRouter)
app.use('/v1', connectorRouter)
// Public: recipes are prompts, not secrets, and a site that has lost its
// pairing still needs its playbooks — that is precisely when someone is
// trying to fix it.
app.use('/v1', cookbookRouter)
// Protected: everything the hub reads after login.
app.use('/v1', requireAuth, accountRouter)
app.use('/v1', requireAuth, sitesRouter)

// Run the daily security digest on demand (scan all paired sites + send to Telegram).
app.post('/v1/digest/run', requireAuth, async (_req, res, next) => {
  try { res.json(await runDailyDigest()) } catch (e) { next(e) }
})

// Force an intel refresh. Long-running by design on a first run, so it is a
// deliberate call rather than something that happens on boot — a server that
// ingests at startup turns a crash loop into a rate-limit ban.
//
// Behind auth: it is minutes of outbound requests against NVD and GitHub, and
// an unauthenticated trigger is a way for anyone to get our IP rate-limited
// out of both.
app.post('/v1/intel/refresh', requireAuth, async (req, res, next) => {
  try { res.json(await refreshIntel({ force: true })) } catch (e) { next(e) }
})

app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err)
  res.status(err.status || 500).json({ message: err.message || 'server error' })
})

// Connect + migrate + seed before accepting traffic.
initDb()
  .then(initIntel)
  .then(() => {
    app.listen(config.port, () => {
      console.log(`DigiWP server on :${config.port}  (Postgres, live relay: ${config.live ? 'on' : 'off'})`)
      scheduleDailyDigest()
      scheduleIntel()
    })
  })
  .catch((e) => {
    console.error('Failed to initialise the database:', e.message)
    process.exit(1)
  })

export default app
