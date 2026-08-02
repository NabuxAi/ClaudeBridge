// ============================================================
// The events table's DDL, on its own.
//
// It used to live in events.js, which db.js imported for this one string —
// while events.js imports db.js for its query helpers. That is a cycle, and an
// ES module cycle does not fail loudly: it works or explodes depending on which
// side is evaluated first. Importing events.js before db.js threw
// "Cannot access 'EVENTS_SCHEMA' before initialization" and took the process
// down at boot, so the server only started because of the order index.js
// happened to use.
//
// A DDL string depends on nothing. Giving it its own module breaks the cycle
// outright rather than papering over it with import ordering nobody can see.
// ============================================================

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'info',
    title       TEXT NOT NULL,
    detail      JSONB,
    -- A dedup key: one open event per real-world condition. A site that fails
    -- every nightly scan for a week is one unresolved problem, not seven
    -- alerts, and an inbox that cries seven times is an inbox people mute.
    fingerprint TEXT,
    resolved_at BIGINT,
    created_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_site ON events(site_id, created_at DESC);

  -- What we tried to send, to whom, and what each provider said.
  --
  -- Kept because "we notified you" is a claim, and a claim about an emergency
  -- needs evidence behind it. It is also the only way to notice that a channel
  -- has been quietly failing for a fortnight.
  CREATE TABLE IF NOT EXISTS alert_deliveries (
    id         TEXT PRIMARY KEY,
    event_id   TEXT REFERENCES events(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id    TEXT,
    delivered  TEXT,
    attempts   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alert_site ON alert_deliveries(site_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_open
    ON events(site_id, fingerprint) WHERE resolved_at IS NULL AND fingerprint IS NOT NULL;

  -- Where to reach this person in an emergency. On users, not sites: a phone
  -- belongs to a human, and someone with four sites should not have to enter
  -- it four times.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS contact JSONB
    NOT NULL DEFAULT '{"phone":null,"fcmToken":null,"najvaToken":null}'::jsonb;
`
