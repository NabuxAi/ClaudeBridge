-- Our own security intelligence: vulnerabilities and malware signatures.
--
-- Kept in our database rather than fetched per-site from someone's API, for
-- three reasons that all matter operationally: a rate limit shared across
-- hundreds of sites is not a rate limit you can plan around, a customer site
-- should never have to reach a third party to be scanned, and a capability
-- rented from an API disappears the day that API changes its terms.

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id            BIGSERIAL PRIMARY KEY,
  cve_id        TEXT NOT NULL,
  -- The wordpress.org slug. This is the join key against what a site reports,
  -- and the hardest field to get right: CVEs name products in prose
  -- ("WP Super Cache plugin before 1.7.2"), not by slug.
  slug          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'plugin',   -- plugin | theme | core
  version_from  TEXT,
  version_to    TEXT,
  -- The column the whole feature turns on: is the installed version below this?
  fixed_in      TEXT,
  severity      TEXT,                              -- critical | high | medium | low
  cvss          NUMERIC(3,1),
  summary       TEXT NOT NULL DEFAULT '',
  published_at  BIGINT,
  source        TEXT NOT NULL DEFAULT 'nvd',
  -- Slug matching is not reliable enough to publish blind. Anything the matcher
  -- is unsure about lands here unconfirmed and stays invisible to sites until a
  -- human agrees. A false alarm on a healthy plugin costs more trust than a
  -- missed CVE gains.
  confirmed     BOOLEAN NOT NULL DEFAULT false,
  match_note    TEXT,
  created_at    BIGINT NOT NULL,
  UNIQUE (cve_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_vuln_slug ON vulnerabilities(slug) WHERE confirmed;
CREATE INDEX IF NOT EXISTS idx_vuln_unconfirmed ON vulnerabilities(created_at) WHERE NOT confirmed;

CREATE TABLE IF NOT EXISTS signatures (
  id           BIGSERIAL PRIMARY KEY,
  pattern      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'literal',    -- literal | regex | hex
  severity     TEXT NOT NULL DEFAULT 'suspicious', -- critical | suspicious
  family       TEXT NOT NULL DEFAULT '',
  -- 'ours' is the feedback loop: a sample pulled off a customer site that no
  -- existing signature caught. That source is the one thing here a competitor
  -- cannot buy, because it comes from operating the sites rather than
  -- publishing a feed.
  source       TEXT NOT NULL DEFAULT 'signature-base',
  sample_hash  TEXT,
  first_seen   BIGINT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (pattern, kind)
);

CREATE INDEX IF NOT EXISTS idx_sig_enabled ON signatures(severity) WHERE enabled;

-- One row per feed, so a run can tell what is stale and the panel can show when
-- the intelligence was last refreshed instead of implying it is always current.
CREATE TABLE IF NOT EXISTS intel_runs (
  id          BIGSERIAL PRIMARY KEY,
  feed        TEXT NOT NULL,
  started_at  BIGINT NOT NULL,
  finished_at BIGINT,
  added       INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE INDEX IF NOT EXISTS idx_intel_feed ON intel_runs(feed, started_at DESC);
