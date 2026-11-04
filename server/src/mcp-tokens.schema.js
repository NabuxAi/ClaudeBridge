// ============================================================
// Hub MCP tokens DDL, on its own — same reason as the other
// *.schema.js files: the DDL string depends on nothing.
// ============================================================

export const SCHEMA = `
  -- Personal tokens for the hub's own MCP endpoint (/v1/mcp): one URL an
  -- AI client connects to, acting on every site its owner can reach.
  -- Only SHA-256 of the token is stored; the token itself is shown once.
  CREATE TABLE IF NOT EXISTS mcp_tokens (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL DEFAULT '',
    token_hash   TEXT NOT NULL,
    created_at   BIGINT NOT NULL,
    last_used_at BIGINT,
    revoked_at   BIGINT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_tokens_hash ON mcp_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user ON mcp_tokens(user_id, created_at DESC);
`
