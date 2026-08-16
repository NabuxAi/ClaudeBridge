// Server configuration from the environment.
export const config = {
  // Optional threat-intel keys. Everything works without them; they add depth
  // when present. Absent is a supported state, not a broken one.
  abuseChKey: process.env.ABUSECH_API_KEY || '',
  virusTotalKey: process.env.VIRUSTOTAL_API_KEY || '',
  port: Number(process.env.PORT || 8787),
  // Secret used to sign hub session tokens (change in production).
  authSecret: process.env.AUTH_SECRET || 'dev-only-change-me',
  // Where the hub is served from, for CORS.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // PostgreSQL connection string. Individual PG* env vars also work via `pg`.
  databaseUrl: process.env.DATABASE_URL || 'postgres://digiwp:digiwp@localhost:5432/digiwp',
  // When '1', per-site reads try the live connector before falling back to seed data.
  live: process.env.LIVE === '1',
  // Demo seed is intentionally opt-in and development-only. Never seed a known
  // demo account into an empty production database.
  seedDemo: process.env.SEED_DEMO === '1',
  // Public base URL of THIS server's API, as reachable from the internet
  // (e.g. https://hub.example.com/api). Used for the pairing serverUrl so
  // the connector on a managed site knows where to reach us. Falls back to
  // the request's own host when unset (fine for local dev).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  // Per-region callback addresses. A site inside Iran may not be able to reach
  // the international domain at all, so it has to be told a different one —
  // and that has to be configuration, not a hardcoded guess about which
  // domains are reachable from where.
  regionBaseUrl: {
    ir: (process.env.PUBLIC_BASE_URL_IR || '').replace(/\/$/, ''),
    intl: (process.env.PUBLIC_BASE_URL_INTL || '').replace(/\/$/, ''),
  },
  // Telegram daily security digest (optional). No-ops when unset.
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  // Optional OpenAI-compatible gateway for the assistant. Absent is a fully
  // supported state: without it the assistant still answers, from the site's
  // own readings rather than from a model.
  assistant: {
    url: process.env.ASSISTANT_URL || '',
    key: process.env.ASSISTANT_API_KEY || '',
    model: process.env.ASSISTANT_MODEL || 'claude-sonnet-5',
  },
  // The assistant looking at each site on its own schedule, rather than only
  // when somebody opens the panel and types a question.
  //
  // OFF unless a deployment asks for it, and deliberately so. It spends gateway
  // tokens on every paired site every day, and under `auto` authority it
  // performs recoverable changes with nobody watching. Both are reasonable
  // things to want and neither should start happening because someone deployed
  // a new version.
  sweep: {
    enabled: /^(1|true|yes|on)$/i.test(String(process.env.ASSISTANT_SWEEP || '')),
    // UTC. Defaults two hours before the digest, so what the sweep finds is in
    // the message rather than in tomorrow's.
    hour: Number.isFinite(Number(process.env.ASSISTANT_SWEEP_HOUR))
      ? Number(process.env.ASSISTANT_SWEEP_HOUR)
      : 6,
    // A ceiling on sites per run. A sweep that quietly grows with the fleet is
    // one that eventually times out or bills a surprise; what it skips is
    // logged rather than silently dropped.
    maxSites: Number(process.env.ASSISTANT_SWEEP_MAX_SITES || 25),
    // Tool calls per site. Lower than a person's question on purpose: nobody is
    // waiting on this, but nobody is watching it either.
    maxToolSteps: Number(process.env.ASSISTANT_SWEEP_TOOL_STEPS || 6),
  },
  // Whether an X-Forwarded-For header may be believed. On by default because
  // this runs behind Traefik; it must be OFF anywhere the server is reachable
  // directly, since the header is trivially forged and a forged one bypasses
  // every per-IP rate limit.
  trustProxy: process.env.TRUST_PROXY !== '0',
  security: {
    // Failed logins from one address before a captcha is demanded. Low enough
    // to price out a script, high enough that a person mistyping a password
    // twice never sees one.
    captchaAfterFailures: Number(process.env.CAPTCHA_AFTER_FAILURES || 3),
  },
  // Where the panel lives, for links inside alerts. An alert without a link is
  // an alert someone has to go hunting after.
  publicPanelUrl: (process.env.PUBLIC_PANEL_URL || '').replace(/\/$/, ''),
  // Emergency channels. Every one of them is optional and the dispatcher walks
  // whatever exists — but a deployment with none configured can reach nobody,
  // which /alerts/readiness reports rather than leaving to be discovered on
  // the night it matters.
  alerts: {
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    najvaApiKey: process.env.NAJVA_API_KEY || '',
    // Iranian SMS gateways all differ, so the field names are configuration.
    // Hardcoding one vendor is how you end up unable to switch in a hurry.
    smsUrl: process.env.SMS_URL || '',
    smsApiKey: process.env.SMS_API_KEY || '',
    smsAuthHeader: process.env.SMS_AUTH_HEADER || '',
    smsToField: process.env.SMS_TO_FIELD || 'to',
    smsTextField: process.env.SMS_TEXT_FIELD || 'text',
    smsFromField: process.env.SMS_FROM_FIELD || 'from',
    smsFrom: process.env.SMS_FROM || '',
    emailUrl: process.env.EMAIL_URL || '',
    emailApiKey: process.env.EMAIL_API_KEY || '',
    emailFrom: process.env.EMAIL_FROM || 'alerts@digiwp.com',
  },
  // Hour (UTC, 0–23) to send the daily digest.
  digestHour: Number.isFinite(Number(process.env.DIGEST_HOUR)) ? Number(process.env.DIGEST_HOUR) : 8,
}

/**
 * The API base to hand to a connector for pairing.
 *
 * A site's own `hosting.callbackUrl` wins when it is set. That is the whole
 * point of the field: a site behind a filter that cannot reach our default
 * domain can be pointed at one it can, and changing it later must not require
 * re-pairing — the connector simply gets a different address next time it is
 * told one.
 */
export function publicApiBase(req, site = null) {
  const perSite = site?.hosting?.callbackUrl
  if (perSite) return perSite
  // Then the region's own address, if one is configured.
  const region = site?.hosting?.region
  const regional = region && config.regionBaseUrl[region]
  if (regional) return regional
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}/v1`
}
