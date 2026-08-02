// ============================================================
// Tool authority — what the assistant may do to a site on its own.
//
// The panel has always had a three-way selector (report / confirm / auto) and
// the server has always stored the answer. Nothing read it. The assistant could
// not act at all, so "how much may it do unattended" was a question about a
// capability that did not exist, and the setting was decoration.
//
// This module is the answer to that question, and the single place it is
// answered. `routes/sites.js` had its own literal list of sensitive tools; two
// lists that must agree are one list that will eventually disagree, so the set
// lives here and the route imports it.
//
// The classification is by consequence, not by name:
//
//   READ       cannot change the site. Always permitted, at every level —
//              refusing to *look* is not caution, it is uselessness.
//   MUTATING   changes the site in a way a backup or a click undoes.
//   SENSITIVE  changes the site in a way that can take it down, destroy data,
//              or hand it to someone else. Always needs a human, at every
//              level — `auto` is authority to work unattended, not authority
//              to run `db_query`.
//
// A tool this module does not know is treated as SENSITIVE. New tools arrive
// in the plugin faster than they arrive here, and the failure that matters is
// the one where an unclassified tool runs unattended.
// ============================================================

/** Tools that only observe. Safe to run at any authority level. */
export const READ_TOOLS = Object.freeze([
  'site_info',
  'update_status',
  'backup_list',
  'backup_read',
  'list_plugins',
  'list_themes',
  'list_files',
  'read_file',
  'list_revisions',
  'list_post_types',
  'list_taxonomies',
  'list_statuses',
  'count_posts',
  'count_terms',
  'get_option',
  'get_meta',
  'get_settings',
  'search',
  'security_scan',
  'core_integrity',
  'conflict_scan',
  'job_status',
  'preview_url',
  'render_page',
  'screenshot',
  'rescue_inventory',
  'rescue_leftovers',
  'rescue_db_audit',
  'rescue_verify',
  'list_recipes',
  'get_recipe',
  'list_wp_skills',
  'get_wp_skill',
])

/** Tools that change the site, recoverably. */
export const MUTATING_TOOLS = Object.freeze([
  'backup_run',
  'flush_cache',
  'perf_clean_transients',
  'set_plugin_state',
  'set_update_policy',
  'update_option',
  'update_settings',
  'update_meta',
  'delete_meta',
  'install_plugin',
  'install_theme',
  'write_file',
  'restore_revision',
  'upload_media_from_url',
  'job_start',
  'conflict_hunt',
  'wp_rest',
])

/**
 * Tools that need a human every time.
 *
 * `edit_file` and `write_file` look similar and are not: writing a new file is
 * recoverable, editing one in place is how a live theme stops rendering.
 * `activate_theme` is here for the same reason — it is one call away from a
 * white screen on the front page.
 */
export const SENSITIVE_TOOLS = Object.freeze([
  'delete_plugin',
  'delete_theme',
  'activate_theme',
  'edit_file',
  'delete_file',
  'db_query',
  'rescue_rotate_keys',
  'create_plugin',
])

const READ = new Set(READ_TOOLS)
const MUTATING = new Set(MUTATING_TOOLS)
const SENSITIVE = new Set(SENSITIVE_TOOLS)

/** Kept as a Set for the route that already thought in these terms. */
export const SENSITIVE_SET = SENSITIVE

export const AUTHORITY_LEVELS = Object.freeze(['report', 'confirm', 'auto'])

/** Where a tool sits. Anything unrecognised is sensitive, deliberately. */
export function classify(tool) {
  const name = String(tool || '')
  if (READ.has(name)) return 'read'
  if (MUTATING.has(name)) return 'mutating'
  if (SENSITIVE.has(name)) return 'sensitive'
  return 'sensitive'
}

export function isSensitive(tool) {
  return classify(tool) === 'sensitive'
}

/** Normalise whatever is stored; an unknown level is the most cautious one. */
export function readAuthority(raw) {
  const level = String(raw || '')
  return AUTHORITY_LEVELS.includes(level) ? level : 'report'
}

/**
 * May the assistant run this tool by itself at this authority level?
 *
 * Returns `{ allowed, reason }` rather than a bare boolean, because the caller
 * has to tell the user *why* it stopped — "this needs your approval" and "I am
 * only allowed to look right now" are different sentences and lead to
 * different next steps.
 */
export function permits(level, tool) {
  const authority = readAuthority(level)
  const kind = classify(tool)

  if (kind === 'read') {
    return { allowed: true, kind, reason: null }
  }
  if (kind === 'sensitive') {
    return {
      allowed: false,
      kind,
      reason: 'این اقدام حساس است و در هر سطحی به تأیید صریح شما نیاز دارد.',
    }
  }
  // Mutating.
  if (authority === 'auto') {
    return { allowed: true, kind, reason: null }
  }
  if (authority === 'confirm') {
    return { allowed: false, kind, reason: 'این تغییر به تأیید شما نیاز دارد.' }
  }
  return {
    allowed: false,
    kind,
    reason: 'سطح اختیار روی «فقط گزارش» است، پس تغییری روی سایت انجام نمی‌دهم.',
  }
}

/** The tools the model is offered at a given level: everything it may see. */
export function offeredTools(level) {
  const authority = readAuthority(level)
  if (authority === 'auto') return [...READ_TOOLS, ...MUTATING_TOOLS]
  // At `report` and `confirm` the model is still shown the mutating tools, so
  // it can *propose* one precisely instead of describing it in prose. Whether
  // the call runs is decided by `permits`, not by what it was offered.
  return [...READ_TOOLS, ...MUTATING_TOOLS]
}
