// Server configuration from the environment.
export const config = {
  port: Number(process.env.PORT || 8787),
  // Secret used to sign hub session tokens (change in production).
  authSecret: process.env.AUTH_SECRET || 'dev-only-change-me',
  // Where the hub is served from, for CORS.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // SQLite database file (created if missing).
  dbFile: process.env.DB_FILE || './digiwp.db',
  // When '1', per-site reads try the live connector before falling back to seed data.
  live: process.env.LIVE === '1',
  // Public base URL of THIS server's API, as reachable from the internet
  // (e.g. https://hub.example.com/api). Used for the pairing serverUrl so
  // the connector on a managed site knows where to reach us. Falls back to
  // the request's own host when unset (fine for local dev).
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
}

/** The API base to hand to a connector for pairing. */
export function publicApiBase(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}/v1`
}
