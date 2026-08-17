// ============================================================
// Notification preferences and contact enrollment DDL.
//
// Kept in its own module so the DDL string does not create an import cycle
// between db.js and the code that uses these tables.
// ============================================================

export const SCHEMA = `
  -- Per-user, per-channel notification preferences.
  --
  -- Channels are the ones the alert dispatcher understands (email, sms, push).
  -- The destination column is optional: if null, the contact of that type
  -- marked verified is used. quiet_hours are 0-23 inclusive; null means off.
  CREATE TABLE IF NOT EXISTS notification_settings (
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel             TEXT NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT false,
    destination         TEXT,
    quiet_hours_start   INT CHECK (quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23)),
    quiet_hours_end     INT CHECK (quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23)),
    updated_at          BIGINT NOT NULL,
    PRIMARY KEY (user_id, channel)
  );

  CREATE INDEX IF NOT EXISTS idx_notification_settings_user
    ON notification_settings(user_id, updated_at DESC);

  -- Contacts a user explicitly enrolls for alerts.
  --
  -- A user may have multiple emails or phone numbers; verification is recorded
  -- when the owner proves control (e.g. by clicking a token link). The token
  -- itself lives in a separate verification table if we add email/SMS proof
  -- flows; verified_at here is just the outcome.
  CREATE TABLE IF NOT EXISTS user_contacts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    value       TEXT NOT NULL,
    verified_at BIGINT,
    created_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_user_contacts_user
    ON user_contacts(user_id, type, created_at DESC);

  -- One row per (user, type, value) so enrolling the same phone twice is idempotent.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contacts_unique
    ON user_contacts(user_id, type, value);
`
