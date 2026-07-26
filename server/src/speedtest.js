// ============================================================
// Speed test — the server fetches a site and measures response timing
// (TTFB, total, size) over a few samples. Control-plane view of how fast
// a managed site responds; surfaced in the hub.
// ============================================================

/** Measure one URL: TTFB (time to first byte), total, bytes, status. */
async function measureOnce(url) {
  const t0 = performance.now()
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
    headers: { 'User-Agent': 'DigiWP-SpeedTest/1.0', 'Accept': 'text/html' },
  })
  let ttfb = null
  let bytes = 0
  const reader = res.body && res.body.getReader ? res.body.getReader() : null
  if (reader) {
    const first = await reader.read()
    ttfb = performance.now() - t0
    if (first.value) bytes += first.value.length
    // drain the rest to get total transfer time
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) bytes += value.length
    }
  } else {
    const buf = await res.arrayBuffer()
    bytes = buf.byteLength
    ttfb = performance.now() - t0
  }
  const total = performance.now() - t0
  return { status: res.status, ttfb: Math.round(ttfb), total: Math.round(total), bytes }
}

/**
 * Run `samples` measurements and summarize. Returns the best (fastest total)
 * run plus a simple grade, so the panel can show one number and a colour.
 */
export async function measureUrl(url, samples = 3) {
  const runs = []
  for (let i = 0; i < samples; i++) {
    try {
      runs.push(await measureOnce(url))
    } catch (e) {
      runs.push({ error: e.message })
    }
  }
  const ok = runs.filter((r) => !r.error && r.status && r.status < 500)
  const best = ok.length ? ok.reduce((a, b) => (a.total <= b.total ? a : b)) : null
  const avgTtfb = ok.length ? Math.round(ok.reduce((s, r) => s + r.ttfb, 0) / ok.length) : null
  const grade = !best ? 'unknown'
    : best.ttfb < 300 ? 'excellent'
    : best.ttfb < 700 ? 'good'
    : best.ttfb < 1500 ? 'fair'
    : 'slow'
  return { url, samples, ok: ok.length, best, avgTtfb, grade, runs, measuredAt: new Date().toISOString() }
}
