// Server configuration from the environment.
export const config = {
  port: Number(process.env.PORT || 8787),
  // Secret used to sign hub session tokens (change in production).
  authSecret: process.env.AUTH_SECRET || 'dev-only-change-me',
  // Where the hub is served from, for CORS.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // Optional JSON file to persist the store across restarts.
  dataFile: process.env.DATA_FILE || '',
  // When '1', per-site reads try the live connector before falling back to seed data.
  live: process.env.LIVE === '1',
}
