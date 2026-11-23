// ============================================================
// Invoices: one row per checkout attempt.
//
// The row is the payment record: what was asked (plan, months, amount in
// toman), what the gateway said (its transaction id, the bank's tracking
// number, the masked card), and what it bought (the period it activated).
// Financial records are kept: account deletion tombstones the user row and
// never removes these.
// ============================================================

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS invoices (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan          TEXT NOT NULL,
    months        INTEGER NOT NULL,
    amount        BIGINT NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'IRT',
    status        TEXT NOT NULL DEFAULT 'pending',
    gateway       TEXT NOT NULL,
    gateway_ref   TEXT,
    bank_ref      TEXT,
    card_mask     TEXT,
    failure       TEXT,
    period_start  BIGINT,
    period_end    BIGINT,
    created_at    BIGINT NOT NULL,
    paid_at       BIGINT,
    updated_at    BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_gateway_ref
    ON invoices(gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_invoices_user
    ON invoices(user_id, created_at DESC);
`
