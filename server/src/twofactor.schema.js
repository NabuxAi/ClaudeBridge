// ============================================================
// Two-factor (TOTP) DDL, on its own — same reason as the other
// *.schema.js files: the DDL string depends on nothing, so keeping
// it in a standalone module avoids import cycles.
// ============================================================

export const SCHEMA = `
  -- Per-user TOTP enrollment. One row per user: either nothing exists yet
  -- (no row), a secret is waiting for its first correct code ("pending"),
  -- or the factor is live ("active").
  --
  -- The base32 secret is stored as-is because it must be recoverable to
  -- verify every future login — unlike reset tokens, this is not a value
  -- that is checked once and forgotten. Protecting it is the database's
  -- job; the routes never echo it back after activation.
  CREATE TABLE IF NOT EXISTS two_factor (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret       TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   BIGINT NOT NULL,
    activated_at BIGINT
  );

  -- One-time recovery codes, SHA-256 hashed before storage for the same
  -- reason reset tokens are: a database leak must not hand out working
  -- credentials. "used_at" is the durable evidence a code was spent once.
  CREATE TABLE IF NOT EXISTS two_factor_recovery (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    used_at    BIGINT,
    created_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_twofactor_recovery_user
    ON two_factor_recovery(user_id, created_at DESC);
`
