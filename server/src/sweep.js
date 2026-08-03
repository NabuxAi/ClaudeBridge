// ============================================================
// The assistant, started by this server rather than by a person.
//
// Everything needed for the assistant to look after a site was already built —
// 58 tools through the signed connector, an authority level per site, refusals
// captured as approvable proposals, an audit trail, a proposal inbox in the
// panel and a line in the daily digest. All of it fired from exactly one place:
// somebody opening the panel and typing a question.
//
// So the maintenance only happened when someone remembered to ask for it. The
// nightly work this server does on its own was a single fixed probe —
// `security_scan` inside the digest — which finds malware and nothing else. An
// expiring certificate, a plugin that has been failing to update for a week, a
// backup that has not run since April: all visible to the assistant, none of
// them looked at unless a human went looking first.
//
// This runs the same assistant, on the same authority, on a schedule. It adds
// no capability: everything it can do, a person asking a question could already
// have done. What it changes is that nobody has to remember.
// ============================================================
import { all } from './db.js'
import { config } from './config.js'
import * as assistant from './assistant.js'
import * as events from './events.js'

/**
 * What the assistant is asked, on every site, every time.
 *
 * Fixed text, not configuration and never anything a user supplied. This runs
 * unattended against live sites with tool access, and a prompt somebody can
 * edit from outside is an instruction channel into that. The authority level
 * still bounds what may actually happen, but the prompt decides what gets
 * attempted, and "propose what needs doing" and "delete the plugins you think
 * are unused" are not the same instruction.
 *
 * It asks for a check, not a change. Under `auto` the assistant may still
 * perform a recoverable fix, which is what the owner chose that setting for;
 * under the other two levels it produces proposals. Either way the wording does
 * not push toward acting — an unattended run is the wrong moment to be
 * enthusiastic.
 */
export const SWEEP_PROMPT = [
  'این یک بررسی خودکار روزانه است؛ کسی پشت آن منتظر نیست.',
  'وضعیت سایت را بررسی کن: به‌روزرسانی‌های معوق، آخرین بکاپ، و هر چیزی که در',
  'خواندن‌ها غیرعادی است.',
  'اگر همه چیز سالم است، همان را کوتاه بگو — گزارشِ «مشکلی نیست» یک نتیجهٔ درست است.',
  'اگر کاری لازم است، همان ابزار را صدا بزن. توضیح‌دادنِ کار به‌جای درخواستش',
  'چیزی برای تأیید کردن باقی نمی‌گذارد.',
  'چیزی را که لازم نیست تغییر نده.',
].join('\n')

/**
 * One site.
 *
 * Never throws: a sweep that stops at the first unreachable site leaves the
 * rest unchecked, and the site most likely to fail here is the one most worth
 * knowing about.
 */
export async function sweepSite(site, { maxToolSteps = config.sweep.maxToolSteps } = {}) {
  // Read before the try, so the failure handler never depends on the thing that
  // may have just failed. A catch block that throws while reporting an error
  // takes down the loop it was written to protect.
  const id = site?.id ?? null
  const name = site?.title || site?.name || (id ? String(id) : 'unknown site')

  try {
    const answer = await assistant.answer(site, SWEEP_PROMPT, { maxToolSteps })

    // `answer` already persists proposals, writes the audit trail for anything
    // it performed, and raises the event that puts a waiting approval in the
    // digest. Nothing is re-recorded here — a second write would double every
    // alert and make the proposal deduplication meaningless.
    return {
      site: id,
      name,
      ok: true,
      ran: answer.ran || [],
      proposals: (answer.proposals || []).length,
      // The model was unreachable, so this is the site's own briefing rather
      // than an assistant run. Distinguished because "checked and found
      // nothing" and "could not check" must never read the same.
      degraded: Boolean(answer.note),
    }
  } catch (e) {
    return { site: id, name, ok: false, error: e?.message || 'sweep failed' }
  }
}

/**
 * Every paired site, one after another.
 *
 * Sequential on purpose. Each site costs a bounded tool loop against a gateway
 * shared with everything else on this host, and firing the whole fleet at once
 * is how a maintenance sweep becomes an outage. Nobody is waiting for this to
 * finish.
 */
export async function runSweep({ maxSites = config.sweep.maxSites } = {}) {
  const rows = await all(
    'SELECT id, name, title, url, secret, site_key, paired, authority FROM sites WHERE paired = true ORDER BY id',
  )

  const targets = rows.slice(0, maxSites)
  const skipped = rows.length - targets.length

  const results = []
  for (const site of targets) results.push(await sweepSite(site))

  const failed = results.filter((r) => !r.ok)
  const degraded = results.filter((r) => r.ok && r.degraded)
  const proposed = results.reduce((n, r) => n + (r.proposals || 0), 0)
  const acted = results.reduce((n, r) => n + (r.ran?.length || 0), 0)

  // A sweep that reached nothing is worth an alert; a sweep that found nothing
  // to do is not. Recording every quiet run as an event would bury the loud one.
  if (targets.length && failed.length === targets.length) {
    await events
      .record({
        siteId: targets[0].id,
        kind: 'sweep_failed',
        severity: 'warning',
        title: 'بررسی خودکار روزانه روی هیچ سایتی موفق نبود',
        detail: { sites: targets.length, errors: failed.map((f) => f.error).slice(0, 5) },
        fingerprint: 'sweep-failed:all',
      })
      .catch(() => {})
  }

  return { sites: targets.length, skipped, failed: failed.length, degraded: degraded.length, proposed, acted, results }
}

/**
 * Fire the sweep once per day at config.sweep.hour (UTC).
 *
 * Same shape as the digest scheduler, including the once-per-day guard: a
 * process restarted three times inside the hour must not sweep three times.
 */
export function scheduleSweep() {
  if (!config.sweep.enabled) {
    console.log('Assistant sweep: off (set ASSISTANT_SWEEP=true to have the assistant check each site daily).')
    return
  }
  if (!config.assistant.url || !config.assistant.key) {
    // Without a model the sweep would call `answer` on every site and get the
    // briefing back each time — real readings, but no assistant, and no
    // proposal ever. Saying so beats a daily run that looks like it is working.
    console.warn(
      'Assistant sweep is on but no model is configured, so it would only re-read each site and ' +
        'never propose anything. Set ASSISTANT_URL and ASSISTANT_API_KEY, or ASSISTANT_SWEEP=false.',
    )
    return
  }

  let lastRunDay = null
  const tick = async () => {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    if (now.getUTCHours() !== config.sweep.hour || lastRunDay === day) return

    lastRunDay = day
    try {
      const r = await runSweep()
      console.log(
        `Assistant sweep for ${day}: ${r.sites} sites, ${r.proposed} proposed, ` +
          `${r.acted} performed, ${r.failed} failed${r.skipped ? `, ${r.skipped} skipped over the cap` : ''}.`,
      )
    } catch (e) {
      console.error('Assistant sweep failed:', e.message)
    }
  }
  setInterval(tick, 4 * 60 * 1000)
  console.log(
    `Assistant sweep scheduled daily at ${config.sweep.hour}:00 UTC ` +
      `(max ${config.sweep.maxSites} sites, ${config.sweep.maxToolSteps} tool steps each).`,
  )
}
