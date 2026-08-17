// ============================================================
// DigiWP Ai Support — the واسط server.
// Sits between the hub UI and the WP Claude Bridge connectors.
// The hub only ever talks to THIS server; this server is the only
// thing that (HMAC-signed) talks to the managed sites' connectors.
// ============================================================
import { pathToFileURL } from 'node:url'

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
import offsiteBackupsRouter from './routes/offsite-backups.js'
import { runDailyDigest, scheduleDailyDigest } from './digest.js'
import { initIntel, scheduleIntel, refresh as refreshIntel } from './intel/index.js'
import { runSweep, scheduleSweep } from './sweep.js'

// Before anything binds a port: a server running on the development signing
// secret will happily accept a session token anyone reading this repository
// can mint.
assertSecretIsReal()

/**
 * Build the HTTP app without starting anything.
 *
 * Split out because the pairing flow — sign up, add a site, register the
 * plugin against it — had never been tested, and could not be: importing this
 * module connected to the database, bound a port and started three daily
 * schedulers as a side effect. A test that has to boot the whole service to
 * make one HTTP request is a test nobody writes, which is exactly what
 * happened to the most security-sensitive path in the product.
 *
 * Nothing about the mounted app changes: same routers, same order, same
 * middleware. The point is that `createApp()` has no side effects.
 */
export function createApp() {
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
  app.use('/v1', requireAuth, offsiteBackupsRouter)

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

  // Run the assistant over every paired site now, instead of waiting for the
  // hour. This is how the sweep gets verified against real sites rather than
  // trusted because its tests pass — the same reason /v1/digest/run exists.
  //
  // Behind auth and deliberately not a GET: it spends gateway tokens on every
  // paired site and, on a site set to `auto`, may perform a change. A link that
  // does that when something crawls it is not a feature.
  //
  // It runs regardless of ASSISTANT_SWEEP, which only governs the schedule —
  // asking for one directly is already the decision that flag protects.
  app.post('/v1/sweep/run', requireAuth, async (req, res, next) => {
    try {
      const maxSites = Number(req.body?.maxSites)
      // Recorded as manual. A run somebody triggered is not evidence that the
      // schedule is alive, and the digest's staleness line would otherwise be
      // reset by the very act of checking on it.
      res.json(await runSweep({
        trigger: 'manual',
        ...(Number.isFinite(maxSites) && maxSites > 0 ? { maxSites } : {}),
      }))
    } catch (e) { next(e) }
  })

  app.use((err, _req, res, _next) => {
    if (!err.status || err.status >= 500) console.error(err)
    res.status(err.status || 500).json({ message: err.message || 'server error' })
  })

  return app
}

const app = createApp()

/** Connect, migrate, seed, then accept traffic and start the daily jobs. */
export function start() {
  return initDb()
    .then(initIntel)
    .then(() => {
      app.listen(config.port, () => {
        console.log(`DigiWP server on :${config.port}  (Postgres, live relay: ${config.live ? 'on' : 'off'})`)
        scheduleDailyDigest()
        scheduleIntel()
        scheduleSweep()
      })
    })
    .catch((e) => {
      console.error('Failed to initialise the database:', e.message)
      process.exit(1)
    })
}

// Only when this file is what was run. Importing it used to bind the configured
// port and start three daily schedulers as a side effect, so any test that
// wanted one HTTP request had to boot the entire service — and the most
// security-sensitive path in the product went untested for exactly that reason.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  start()
}

export default app
