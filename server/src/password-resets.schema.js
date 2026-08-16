// ============================================================
// Password reset tokens DDL, on its own — same reason as the
// other *.schema.js files: the DDL string depends on nothing,
// so keeping it in a standalone module avoids import cycles.
// ============================================================

export const SCHEMA = `
  -- Single-use expiring password-reset tokens.
  --
  -- Tokens are hashed before storage, so a database leak does not let an
  -- attacker reuse them. A used token stays in the row; "used_at" is the
  -- durable evidence that the token was spent exactly once.
  CREATE TABLE IF NOT EXISTS password_resets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at    BIGINT,
    created_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_password_resets_user
    ON password_resets(user_id, created_at DESC);

  -- A user should only have one active (unused) token at a time. Expired tokens
  -- are cleaned up by create() before a new one is inserted.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_active
    ON password_resets(user_id) WHERE used_at IS NULL;
`
