// ============================================================
// Cross-server account links DDL (peer-link.js).
// ============================================================

export const SCHEMA = `
  -- One account here linked to one account on the partner DigiWP server
  -- (Iran <-> international), so one hub MCP token reaches the sites of both.
  -- Created only by redeeming a code the person made while signed in on the
  -- other side; each side keeps its own row and checks it on every call.
  CREATE TABLE IF NOT EXISTS account_links (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_user_id  TEXT NOT NULL,
    peer_email    TEXT NOT NULL,
    created_at    BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_account_links_user ON account_links(user_id);

  -- Short-lived link codes: SHA-256 only, ten minutes, spent once.
  CREATE TABLE IF NOT EXISTS account_link_codes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    expires_at  BIGINT NOT NULL,
    used_at     BIGINT,
    created_at  BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_account_link_codes_hash ON account_link_codes(code_hash);
`
