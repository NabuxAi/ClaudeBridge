// ============================================================
// Uptime monitors DDL.
//
// Stored separately from db.js like every other schema fragment, so the DDL
// string cannot be part of an import cycle: db.js imports this module only for
// the string, and the store/route modules import db.js for query helpers.
//
// What a monitor is, honestly: one URL the server GETs on a schedule and
// records the answer. It is reachability of one HTTP endpoint — not a user
// journey, not checkout, not a login flow. The label the product carries
// everywhere for this is «بررسی دسترسی HTTP، نه سفر کاربری/پرداخت».
// ============================================================

export const SCHEMA = `
  -- One monitored URL per row, configured by the site owner.
  --
  -- expect_status is the single status code that counts as "up" (default 200;
  -- a health endpoint that deliberately answers 204 sets 204). expect_contains
  -- is an optional substring the response body must carry, so a cached error
  -- page that answers 200 can still be called what it is.
  CREATE TABLE IF NOT EXISTS site_monitors (
    id              TEXT PRIMARY KEY,
    site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    url             TEXT NOT NULL,
    expect_status   INT NOT NULL DEFAULT 200,
    expect_contains TEXT,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_at      BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_site_monitors_site
    ON site_monitors(site_id, created_at);

  -- One row per check attempt — success, wrong status, and "could not connect"
  -- all land here, because availability is computed from attempts, not from
  -- successes. Rows older than the retention window are pruned (see
  -- monitors.store.js); the 30-day window must always fit inside what is kept.
  CREATE TABLE IF NOT EXISTS monitor_results (
    id         TEXT PRIMARY KEY,
    monitor_id TEXT NOT NULL REFERENCES site_monitors(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    ok         BOOLEAN NOT NULL,
    status     INT,
    ms         INT,
    error      TEXT,
    checked_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor
    ON monitor_results(monitor_id, checked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_monitor_results_site
    ON monitor_results(site_id, checked_at DESC);
`
