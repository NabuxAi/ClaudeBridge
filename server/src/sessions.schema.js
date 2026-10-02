// ============================================================
// Hub sessions DDL, on its own — same reason as the other
// *.schema.js files: the DDL string depends on nothing, so keeping
// it in a standalone module avoids import cycles.
// ============================================================

export const SCHEMA = `
  -- Server-side hub sessions. A bearer token is no longer trusted just
  -- because its signature verifies: every session token carries a random
  -- "jti", and requireAuth looks up SHA-256(jti) here on every request.
  -- Revocation, expiry and "log out other devices" are rows in this table,
  -- not wishes printed into an unrevocable signature.
  --
  -- Only SHA-256 of the jti is stored — never the token itself — so a
  -- database leak does not hand out live credentials.
  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,
    device       TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT '',
    created_at   BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    expires_at   BIGINT NOT NULL,
    revoked_at   BIGINT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON sessions(user_id, created_at DESC);

  -- requireAuth runs this lookup on every authenticated request.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash
    ON sessions(token_hash);
`
