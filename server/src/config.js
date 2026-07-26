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
  // Public base URL of THIS server's API, as reachable from the internet
  // (e.g. https://hub.example.com/api). Used for the pairing serverUrl so
  // the connector on a managed site knows where to reach us. Falls back to
  // the request's own host when unset (fine for local dev).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
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
  // Hour (UTC, 0–23) to send the daily digest.
  digestHour: Number.isFinite(Number(process.env.DIGEST_HOUR)) ? Number(process.env.DIGEST_HOUR) : 8,
}

/** The API base to hand to a connector for pairing. */
export function publicApiBase(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}/v1`
}
