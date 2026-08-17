// ============================================================
// Off-site backup targets and jobs DDL.
//
// Stored separately from db.js so the DDL string cannot be part of an import
// cycle: db.js imports this module only for the string, and the store/route
// modules import db.js for query helpers.
// ============================================================

export const SCHEMA = `
  -- S3-compatible destinations configured by the site owner.
  --
  -- Secrets are encrypted at rest with AES-256-GCM; the raw credential never
  -- leaves the server in normal responses.
  CREATE TABLE IF NOT EXISTS offsite_backup_targets (
    id                          TEXT PRIMARY KEY,
    site_id                     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    type                        TEXT NOT NULL DEFAULT 's3',
    endpoint                    TEXT NOT NULL,
    bucket                      TEXT NOT NULL,
    region                      TEXT NOT NULL DEFAULT '',
    access_key_id               TEXT NOT NULL,
    secret_access_key_encrypted TEXT NOT NULL,
    path_prefix                 TEXT NOT NULL DEFAULT '',
    retention_days              INT  NOT NULL DEFAULT 30,
    created_at                  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_offsite_targets_site
    ON offsite_backup_targets(site_id, created_at DESC);

  -- Each upload attempt to an off-site target.
  --
  -- status is one of: queued | running | done | failed.
  -- size_bytes is the payload bytes the server actually uploaded.
  CREATE TABLE IF NOT EXISTS offsite_backup_jobs (
    id           TEXT PRIMARY KEY,
    site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    target_id    TEXT NOT NULL REFERENCES offsite_backup_targets(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued',
    started_at   BIGINT NOT NULL,
    completed_at BIGINT,
    size_bytes   BIGINT,
    error        TEXT,
    created_at   BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_offsite_jobs_site
    ON offsite_backup_jobs(site_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_offsite_jobs_target
    ON offsite_backup_jobs(target_id, created_at DESC);
`
