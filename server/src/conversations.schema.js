// ============================================================
// Assistant Conversations & Messages Schema (DDL)
// ============================================================

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS assistant_conversations (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    title       TEXT NOT NULL DEFAULT 'گفتگوی جدید',
    status      TEXT NOT NULL DEFAULT 'ready', -- 'processing' | 'ready' | 'error'
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_site
    ON assistant_conversations(site_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS assistant_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    site_id         TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    sender          TEXT NOT NULL, -- 'user' | 'ai' | 'system'
    text            TEXT NOT NULL DEFAULT '',
    refs            JSONB,
    note            TEXT,
    unknown         JSONB,
    proposals       JSONB,
    ran             JSONB,
    error           TEXT,
    created_at      BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON assistant_messages(conversation_id, created_at ASC);
`
