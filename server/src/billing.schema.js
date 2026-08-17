// ============================================================
// Billing / subscription / plan tables DDL, on its own.
//
// Same reason as the other *.schema.js files: the DDL string depends on
// nothing, so keeping it standalone avoids any import cycle with db.js.
// ============================================================

export const SCHEMA = `
  -- Plans reference table. Source of truth for what each plan costs and what
  -- it allows. Kept in the DB (not only seed.js) so the server can enforce
  -- entitlements without trusting the hub.
  CREATE TABLE IF NOT EXISTS plans (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price       BIGINT NOT NULL DEFAULT 0,
    popular     BOOLEAN NOT NULL DEFAULT false,
    site_limit  INTEGER,
    features    TEXT[] NOT NULL DEFAULT '{}',
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
  );

  -- User subscription. One row per account. A missing row means the account
  -- has not been enrolled yet; reads will create a default trialing record.
  CREATE TABLE IF NOT EXISTS subscriptions (
    id                     TEXT PRIMARY KEY,
    user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan                   TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'trialing',
    trial_ends_at          BIGINT,
    current_period_start   BIGINT,
    current_period_end     BIGINT,
    cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
    metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             BIGINT NOT NULL,
    updated_at             BIGINT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user
    ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
    ON subscriptions(plan);

  -- Seed the canonical plans if the table is empty. This is reference data,
  -- not demo content, and is safe to run on every boot because of the EXISTS
  -- guard inside the CTE.
  INSERT INTO plans (id, name, price, popular, site_limit, features, created_at, updated_at)
  SELECT * FROM (VALUES
    ('base',   'پایه',    190000, false, 1,  ARRAY['۱ سایت', 'به‌روزرسانی خودکار هسته، افزونه و قالب', 'بکاپ دیتابیس روی خود سایت', 'اسکن امنیتی روزانه'],                         EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
    ('pro',    'حرفه‌ای',  490000, true,  5,  ARRAY['۵ سایت', 'همهٔ امکانات پلن پایه', 'بررسی یکپارچگی فایل‌های هسته', 'بررسی تداخل افزونه و قالب', 'عملیات نجات'],           EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000),
    ('agency', 'آژانس',   990000, false, NULL, ARRAY['سایت نامحدود', 'همهٔ امکانات پلن حرفه‌ای', 'گزارش امنیتی روزانه در تلگرام'],                                      EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
  ) AS v(id, name, price, popular, site_limit, features, created_at, updated_at)
  WHERE NOT EXISTS (SELECT 1 FROM plans);
`
