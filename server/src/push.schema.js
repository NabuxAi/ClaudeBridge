// ============================================================
// Web Push subscription DDL, on its own — same reason as the other
// *.schema.js files: the DDL string depends on nothing, so keeping
// it in a standalone module avoids import cycles.
// ============================================================

export const SCHEMA = `
  -- Browser push subscriptions (PushManager.subscribe), one per browser
  -- endpoint. The endpoint is the capability: whoever holds the URL can push
  -- to that browser, so it is unique, never listed in full through the API,
  -- and deleted the moment a push service declares it gone (404/410).
  --
  -- p256dh/auth are the per-subscription encryption keys the browser minted —
  -- required to encrypt a payload, useless without the endpoint. A user can
  -- have several (phone, laptop, tablet); each row is owned and removable by
  -- exactly one account.
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );

  -- The endpoint is the natural upsert key: a browser re-subscribing keeps one
  -- row instead of piling up dead duplicates the dispatcher would then pay for.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
    ON push_subscriptions(endpoint);

  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions(user_id, created_at DESC);
`
