// ============================================================
// The proposals table's DDL, on its own — same reason as events.schema.js:
// a DDL string depends on nothing, so giving it its own module keeps it out of
// any import cycle.
// ============================================================

export const SCHEMA = `
  -- A change the assistant asked to make and was refused, waiting for a human.
  --
  -- These used to exist only in the answer payload, which meant they lived in
  -- the panel's React state and nowhere else: a refresh lost them, and a
  -- proposal could never wait for the person who is actually allowed to approve
  -- it. That is most of the point of a three-way authority setting — "confirm"
  -- is only meaningful if the confirmation can arrive later, and from someone
  -- other than whoever happened to ask the question.
  CREATE TABLE IF NOT EXISTS proposals (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    -- Who the assistant was answering when it proposed this. Kept for the audit
    -- trail, not for permission: anyone who can reach the site may approve.
    user_id     TEXT,
    tool        TEXT NOT NULL,
    args        JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- 'mutating' or 'sensitive', from the shared authority policy. Stored
    -- rather than recomputed so the panel shows what was true when the
    -- proposal was made, even if the policy is later changed.
    kind        TEXT NOT NULL,
    reason      TEXT,
    authority   TEXT,
    -- pending | approved | rejected. Terminal states keep the row: "who
    -- approved the plugin deletion" is exactly the question an audit asks.
    status      TEXT NOT NULL DEFAULT 'pending',
    resolved_by TEXT,
    resolved_at BIGINT,
    result      JSONB,
    created_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proposals_site
    ON proposals(site_id, created_at DESC);

  -- One open proposal per (site, tool, args). The assistant re-proposes the
  -- same change every time it is asked the same question, and a list that grows
  -- a row per retry is a list nobody reads.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_open
    ON proposals(site_id, tool, md5(args::text)) WHERE status = 'pending';
`
