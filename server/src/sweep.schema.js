// ============================================================
// The sweep_runs table's DDL, on its own — same reason as events.schema.js and
// proposals.schema.js: a DDL string depends on nothing, so its own module keeps
// it out of any import cycle.
// ============================================================

export const SCHEMA = `
  -- One row per assistant sweep.
  --
  -- The sweep runs at 06:00 and the digest goes out at 08:00, and nothing
  -- connected the two: a sweep that found nothing produced exactly the same
  -- silence as a sweep that never ran, or one that died on its first site. The
  -- proposals it raises do reach the digest, but only when there are any — so
  -- the quiet, working case and the broken case were indistinguishable, which
  -- is the failure mode that keeps turning up in this codebase.
  --
  -- Deliberately a table rather than an event. An event every morning saying
  -- "the sweep ran" is an alert list nobody reads, and it would sit alongside
  -- the ones that mean a site is compromised.
  CREATE TABLE IF NOT EXISTS sweep_runs (
    id          TEXT PRIMARY KEY,
    started_at  BIGINT NOT NULL,
    finished_at BIGINT NOT NULL,
    -- Sites actually swept, and how it went. "skipped" is what the per-run cap
    -- left out, recorded because a sweep that silently stops at 25 reads as one
    -- that covered the whole fleet.
    sites       INTEGER NOT NULL DEFAULT 0,
    skipped     INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    -- The assistant answered from the site's own readings because no model was
    -- reachable. Counted apart from a failure: the sweep did run, and it
    -- proposed nothing because it could not think, not because nothing was
    -- wrong.
    degraded    INTEGER NOT NULL DEFAULT 0,
    proposed    INTEGER NOT NULL DEFAULT 0,
    performed   INTEGER NOT NULL DEFAULT 0,
    -- 'scheduled' or 'manual'. A run somebody triggered from the panel is not
    -- evidence that the schedule is alive.
    trigger     TEXT NOT NULL DEFAULT 'scheduled'
  );

  CREATE INDEX IF NOT EXISTS idx_sweep_runs_time
    ON sweep_runs(finished_at DESC);
`
