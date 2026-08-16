// ============================================================
// Update policy — what keeps itself current on a managed site.
//
// Three independent switches (core, plugins, themes) plus safe mode.
//
// Safe mode is not a preset that ticks the other three for you; it is a lock.
// While it is on, the three cannot be turned off — by the panel, by a crafted
// request, or by anything else that reaches the API. That is the whole point:
// there is no version of "secure" that is also "running WordPress 5.7 from
// 2021", so a product that offers safe mode and also lets you stop updating is
// lying about one of the two.
//
// The lock lives here, on the server, and is applied to every write. The panel
// renders the switches disabled, but that is a courtesy to the user, not the
// enforcement.
// ============================================================

/** The policy a site gets before anyone touches it: everything current. */
export const DEFAULT_POLICY = Object.freeze({
  safeMode: true,
  autoCore: true,
  autoPlugins: true,
  autoThemes: true,
})

/** The switches safe mode holds down. */
export const LOCKED_WHEN_SAFE = Object.freeze(['autoCore', 'autoPlugins', 'autoThemes'])

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)

/** Normalise whatever is in the database into a complete, well-typed policy. */
export function readPolicy(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  return {
    safeMode: bool(p.safeMode, DEFAULT_POLICY.safeMode),
    autoCore: bool(p.autoCore, DEFAULT_POLICY.autoCore),
    autoPlugins: bool(p.autoPlugins, DEFAULT_POLICY.autoPlugins),
    autoThemes: bool(p.autoThemes, DEFAULT_POLICY.autoThemes),
  }
}

/**
 * Merge a requested change into the current policy, enforcing the lock.
 *
 * Returns the policy to store plus a list of what was refused, so the API can
 * tell the user their request was partly ignored instead of silently dropping
 * it — a switch that springs back with no explanation reads as a bug.
 */
export function applyPolicyChange(current, patch = {}) {
  const now = readPolicy(current)
  const want = { ...now }
  const refused = []

  if (typeof patch.safeMode === 'boolean') want.safeMode = patch.safeMode

  for (const key of LOCKED_WHEN_SAFE) {
    if (typeof patch[key] !== 'boolean') continue
    // Turning a switch OFF is what safe mode forbids. Turning one ON is always
    // allowed — that direction never reduces security.
    if (want.safeMode && patch[key] === false) {
      refused.push(key)
      continue
    }
    want[key] = patch[key]
  }

  // Enabling safe mode in the same request that would have disabled a switch,
  // or on a site where one is already off, pulls everything back up.
  if (want.safeMode) for (const key of LOCKED_WHEN_SAFE) want[key] = true

  return { policy: want, refused }
}

/**
 * The shape the panel renders: each switch with whether it is currently locked.
 * Labels are Persian because the panel is.
 */
export function describePolicy(current) {
  const p = readPolicy(current)
  const locked = p.safeMode
  return {
    safeMode: p.safeMode,
    locked,
    lockReason: locked
      ? 'حالت ایمنی روشن است: آپدیت‌های خودکار هسته/افزونه/قالب خاموش نمی‌شوند. این به‌روز بودن را تضمین می‌کند، نه rollback خودکار پس از یک آپدیتی خراب — rollback کامل فایل هنوز ساخته نشده است.'
      : null,
    switches: [
      {
        id: 'autoCore',
        label: 'به‌روزرسانی خودکار هستهٔ وردپرس',
        desc: 'نصب خودکار نسخه‌های جدید وردپرس، شامل نسخه‌های اصلی',
        on: p.autoCore,
        locked,
      },
      {
        id: 'autoPlugins',
        label: 'به‌روزرسانی خودکار افزونه‌ها',
        desc: 'همهٔ افزونه‌های مخزن وردپرس روی آخرین نسخه می‌مانند',
        on: p.autoPlugins,
        locked,
      },
      {
        id: 'autoThemes',
        label: 'به‌روزرسانی خودکار قالب‌ها',
        desc: 'همهٔ قالب‌های مخزن وردپرس روی آخرین نسخه می‌مانند',
        on: p.autoThemes,
        locked,
      },
    ],
  }
}

/** The compact form sent to the connector on a managed site. */
export function policyForConnector(current) {
  const p = readPolicy(current)
  return {
    auto_core: p.autoCore,
    auto_plugins: p.autoPlugins,
    auto_themes: p.autoThemes,
    safe_mode: p.safeMode,
  }
}
