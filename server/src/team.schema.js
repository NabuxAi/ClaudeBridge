// ============================================================
// Team members and invitations DDL, on its own.
//
// Keeping the DDL in a standalone module avoids import cycles with db.js and
// lets the route/store modules depend on the same shape without circular
// imports.
// ============================================================

export const SCHEMA = `
  -- Accepted site members. The owner (sites.user_id) is the source of truth for
  -- ownership; a row here is created for the owner when a site is added so that
  -- permission checks can be written against one table.
  CREATE TABLE IF NOT EXISTS team_members (
    id           TEXT PRIMARY KEY,
    site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'viewer',
    invited_email TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_team_members_site
    ON team_members(site_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_team_members_user
    ON team_members(user_id);
  -- One active membership per user per site.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_active_user
    ON team_members(site_id, user_id) WHERE status = 'active' AND user_id IS NOT NULL;

  -- Pending invitations. The raw token is emailed; only its SHA-256 hash is kept.
  CREATE TABLE IF NOT EXISTS invitations (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer',
    inviter_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  BIGINT NOT NULL,
    used_at     BIGINT,
    revoked_at  BIGINT,
    created_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_invitations_site
    ON invitations(site_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invitations_email
    ON invitations(email);
  -- One pending invite per email per site.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending
    ON invitations(site_id, email) WHERE used_at IS NULL AND revoked_at IS NULL;
`
