import test from 'node:test'
import assert from 'node:assert/strict'
import * as flaresolverr from '../src/flaresolverr.js'
import { discoverWordPress } from '../src/site-address.js'
import { ping, callTool } from '../src/connector.js'
import { checkMonitor } from '../src/monitors.runner.js'

test.beforeEach(() => {
  flaresolverr._clearCacheForTests()
  flaresolverr._setFetchForTests(null)
  flaresolverr._setConfigForTests(null)
})

test.afterEach(() => {
  flaresolverr._clearCacheForTests()
  flaresolverr._setFetchForTests(null)
  flaresolverr._setConfigForTests(null)
})

test('isConfigured reports false when unset and true when configured', () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: '' } })
  assert.equal(flaresolverr.isConfigured(), false)

  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })
  assert.equal(flaresolverr.isConfigured(), true)

  flaresolverr._setConfigForTests({ flaresolverrUrl: 'http://127.0.0.1:8191/v1' })
  assert.equal(flaresolverr.isConfigured(), true)
})

test('getEndpoint normalizes trailing slashes and ensures /v1', () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://flaresolverr:8191' } })
  assert.equal(flaresolverr.getEndpoint(), 'http://flaresolverr:8191/v1')

  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://flaresolverr:8191/' } })
  assert.equal(flaresolverr.getEndpoint(), 'http://flaresolverr:8191/v1')

  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://flaresolverr:8191/v1' } })
  assert.equal(flaresolverr.getEndpoint(), 'http://flaresolverr:8191/v1')

  flaresolverr._setConfigForTests({ flaresolverr: { url: '' } })
  assert.equal(flaresolverr.getEndpoint(), '')
})

test('isPrivateDestination refuses loopback and private networks to prevent SSRF', () => {
  assert.equal(flaresolverr.isPrivateDestination('http://localhost:8080/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://127.0.0.1/admin'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://127.0.0.2/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://127.127.127.127/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://[::1]/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://[::ffff:127.0.0.1]/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://10.0.0.1/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://100.64.0.1/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://192.168.1.1/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://172.16.0.1/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://198.18.0.1/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://169.254.169.254/latest/meta-data/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://flaresolverr:8191/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://metadata.internal/'), true)
  assert.equal(flaresolverr.isPrivateDestination('http://user:pass@example.com/'), true)
  assert.equal(flaresolverr.isPrivateDestination('ftp://example.com/'), true)

  assert.equal(flaresolverr.isPrivateDestination('https://example.com/shop'), false)
  assert.equal(flaresolverr.isPrivateDestination('http://93.184.216.34/'), false)
})

test('isCloudflareChallenge accurately identifies Cloudflare challenge pages and avoids false positives', () => {
  // 1. 403 with Cloudflare server header and HTML body
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
    body: '<html><head><title>Just a moment...</title></head><body>cf-browser-verification</body></html>',
  }), true)

  // 2. 503 with cf-ray header and challenge markers
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 503,
    headers: { 'cf-ray': '85321ab-IAD' },
    body: 'Attention Required! | Cloudflare Checking your browser before accessing',
  }), true)

  // 3. cf-mitigated: challenge header
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 403,
    headers: { 'cf-mitigated': 'challenge' },
  }), true)

  // 4. Turnstile / challenge-platform markers in body
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare' },
    body: '<div id="challenge-platform"><script src="/cdn-cgi/challenge-platform/..."></script></div>',
  }), true)

  // 5. Non-challenge 403 (WordPress REST API application/json error) -> NOT a challenge
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare', 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'rest_forbidden', message: 'Sorry, you cannot view this.' }),
  }), false)

  // 6. Origin 503 Service Unavailable behind Cloudflare without challenge markers -> NOT a challenge
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 503,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
    body: '<html><body>503 Service Temporarily Unavailable</body></html>',
  }), false)

  // 7. Origin 403 Forbidden behind Cloudflare without challenge markers -> NOT a challenge
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 403,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
    body: '<html><body>403 Forbidden - Access Denied by Apache</body></html>',
  }), false)

  // 8. 200 OK with interactive Turnstile / challenge page -> IS a challenge
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 200,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
    body: '<html><head><title>Just a moment...</title></head><body><div id="turnstile-wrapper"></div></body></html>',
  }), true)

  // 9. Generic 500 error from upstream host -> NOT a challenge
  assert.equal(flaresolverr.isCloudflareChallenge({
    status: 500,
    headers: { server: 'nginx', 'content-type': 'text/html' },
    body: '<html><body>Internal Server Error</body></html>',
  }), false)
})

test('clearance cache stores, formats, and expires cookies properly', () => {
  const url = 'https://example.com/shop'
  const cookies = [
    { name: 'cf_clearance', value: 'secret-token-123', domain: '.example.com', expires: Math.floor(Date.now() / 1000) + 3600 },
    { name: '__cf_bm', value: 'bot-management-xyz', domain: '.example.com', expires: Math.floor(Date.now() / 1000) + 1800 },
    // Short-lived tracking cookie must NOT prematurely expire cf_clearance
    { name: 'short_flash', value: 'temp', domain: '.example.com', expires: Math.floor(Date.now() / 1000) + 5 },
  ]
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'

  flaresolverr.saveClearance(url, cookies, userAgent)

  const headers = flaresolverr.getClearanceHeaders(url)
  assert.equal(headers['User-Agent'], userAgent)
  assert.match(headers['Cookie'], /cf_clearance=secret-token-123/)
  assert.match(headers['Cookie'], /__cf_bm=bot-management-xyz/)

  // Subpaths on the same domain also receive the clearance
  const subpathHeaders = flaresolverr.getClearanceHeaders('https://example.com/wp-json/claude-bridge/v1/ping')
  assert.equal(subpathHeaders['User-Agent'], userAgent)
  assert.match(subpathHeaders['Cookie'], /cf_clearance=secret-token-123/)

  // clearing clearance removes it
  flaresolverr.clearClearance(url)
  assert.deepEqual(flaresolverr.getClearanceHeaders(url), {})
})

test('clearance cache discards expired entries', () => {
  const url = 'https://expired.example.com'
  const expiredCookies = [
    { name: 'cf_clearance', value: 'old', expires: Math.floor(Date.now() / 1000) - 10 },
  ]
  flaresolverr.saveClearance(url, expiredCookies, 'UserAgent/1.0')
  assert.deepEqual(flaresolverr.getClearanceHeaders(url), {})
})

test('extractJsonFromSolutionResponse parses raw JSON and Chrome DOM wrapper', () => {
  // Raw JSON
  const raw = '{"namespaces":["wp/v2"]}'
  assert.deepEqual(flaresolverr.extractJsonFromSolutionResponse(raw), { namespaces: ['wp/v2'] })

  // Headless Chrome DOM rendering (<pre style="...">{"namespaces":["wp/v2"]}</pre>)
  const chromeHtml = '<html><head></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">{&quot;namespaces&quot;:[&quot;wp/v2&quot;,&quot;claude-bridge/v1&quot;]}</pre></body></html>'
  assert.deepEqual(flaresolverr.extractJsonFromSolutionResponse(chromeHtml), {
    namespaces: ['wp/v2', 'claude-bridge/v1'],
  })

  // Body wrapped with HTML tags preserved inside JSON
  const bodyHtml = '<html><body>{"ok":true,"rendered":"<p>Welcome</p>","img":"<img src=\\"cat.jpg\\" alt=\\"a > b\\">"}</body></html>'
  assert.deepEqual(flaresolverr.extractJsonFromSolutionResponse(bodyHtml), {
    ok: true,
    rendered: '<p>Welcome</p>',
    img: '<img src="cat.jpg" alt="a > b">',
  })

  // Single-pass HTML unescaping avoids double-unescaping &amp;lt; into <
  const entityHtml = '<pre>{"text":"Use &amp;lt;div&amp;gt; in HTML"}</pre>'
  assert.deepEqual(flaresolverr.extractJsonFromSolutionResponse(entityHtml), {
    text: 'Use &lt;div&gt; in HTML',
  })

  // Non-JSON returns null
  assert.equal(flaresolverr.extractJsonFromSolutionResponse('<html><body><h1>Error</h1></body></html>'), null)
  assert.equal(flaresolverr.extractJsonFromSolutionResponse(''), null)
})

test('solve calls FlareSolverr API, parses solution, caches clearance, and returns structured outcome', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const calls = []
  flaresolverr._setFetchForTests(async (endpoint, opts) => {
    calls.push({ endpoint, opts, body: JSON.parse(opts.body) })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        message: 'Challenge solved!',
        solution: {
          url: 'https://protected.example.com/wp-json/?_fields=namespaces',
          status: 200,
          headers: { 'content-type': 'application/json' },
          cookies: [{ name: 'cf_clearance', value: 'cleared-token-999', domain: '.example.com', expires: Math.floor(Date.now() / 1000) + 3600 }],
          userAgent: 'Mozilla/5.0 FlareTest',
          response: '<pre style="white-space: pre-wrap;">{"namespaces":["wp/v2","claude-bridge/v1"]}</pre>',
        },
      }),
    }
  })

  const res = await flaresolverr.solve({
    url: 'https://protected.example.com/wp-json/?_fields=namespaces',
    headers: { Accept: 'application/json' },
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].endpoint, 'http://localhost:8191/v1')
  assert.equal(calls[0].body.cmd, 'request.get')
  assert.equal(calls[0].body.url, 'https://protected.example.com/wp-json/?_fields=namespaces')
  assert.equal(calls[0].body.headers.Accept, 'application/json')

  assert.equal(res.ok, true)
  assert.equal(res.status, 200)
  assert.deepEqual(res.data, { namespaces: ['wp/v2', 'claude-bridge/v1'] })

  // Clearance headers should now be cached for that domain
  const clearance = flaresolverr.getClearanceHeaders('https://protected.example.com')
  assert.equal(clearance['User-Agent'], 'Mozilla/5.0 FlareTest')
  assert.match(clearance['Cookie'], /cf_clearance=cleared-token-999/)
})

test('solve handles request.post and errors properly', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  // 1. request.post
  let seenPost = null
  flaresolverr._setFetchForTests(async (endpoint, opts) => {
    seenPost = JSON.parse(opts.body)
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        solution: { status: 200, response: '{"ok":true}' },
      }),
    }
  })

  await flaresolverr.solve({
    url: 'https://example.com/submit',
    method: 'POST',
    postData: 'a=1&b=2',
  })
  assert.equal(seenPost.cmd, 'request.post')
  assert.equal(seenPost.postData, 'a=1&b=2')

  // 2. Unconfigured throws 503
  flaresolverr._setConfigForTests({ flaresolverr: { url: '' } })
  await assert.rejects(
    () => flaresolverr.solve({ url: 'https://example.com' }),
    { status: 503, code: 'not_configured' }
  )

  // 3. Private destination throws 400
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })
  await assert.rejects(
    () => flaresolverr.solve({ url: 'http://127.0.0.1:8080/secrets' }),
    { status: 400, code: 'private_destination_refused' }
  )

  // 4. FlareSolverr error payload throws
  flaresolverr._setFetchForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ status: 'error', message: 'Unable to solve challenge: timeout' }),
  }))
  await assert.rejects(
    () => flaresolverr.solve({ url: 'https://example.com' }),
    { status: 502, code: 'solve_failed', message: /Unable to solve challenge/ }
  )
})

test('session management creates, lists, and destroys sessions', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const cmds = []
  flaresolverr._setFetchForTests(async (_ep, opts) => {
    const payload = JSON.parse(opts.body)
    cmds.push(payload)
    if (payload.cmd === 'sessions.create') {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', session: payload.session || 's1' }) }
    }
    if (payload.cmd === 'sessions.list') {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', sessions: ['s1', 's2'] }) }
    }
    if (payload.cmd === 'sessions.destroy') {
      return { ok: true, status: 200, json: async () => ({ status: 'ok', message: 'Destroyed' }) }
    }
  })

  const sid = await flaresolverr.createSession('my-test-session')
  assert.equal(sid, 'my-test-session')
  assert.equal(cmds[0].cmd, 'sessions.create')
  assert.equal(cmds[0].session, 'my-test-session')

  const list = await flaresolverr.listSessions()
  assert.deepEqual(list, ['s1', 's2'])

  const destroyed = await flaresolverr.destroySession('my-test-session')
  assert.equal(destroyed, true)
  assert.equal(cmds[2].cmd, 'sessions.destroy')
})

test('getStatus checks FlareSolverr operational health', async () => {
  // 1. Unconfigured
  flaresolverr._setConfigForTests({ flaresolverr: { url: '' } })
  assert.deepEqual(await flaresolverr.getStatus(), { configured: false, url: null })

  // 2. Configured and reachable
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })
  flaresolverr._setFetchForTests(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok', version: 'v3.3.21', sessions: ['session-a'] }),
  }))
  const liveStatus = await flaresolverr.getStatus()
  assert.equal(liveStatus.configured, true)
  assert.equal(liveStatus.live, true)
  assert.equal(liveStatus.version, 'v3.3.21')
  assert.deepEqual(liveStatus.sessions, ['session-a'])

  // 3. Configured but unreachable
  flaresolverr._setFetchForTests(async () => { throw new Error('ECONNREFUSED 127.0.0.1:8191') })
  const deadStatus = await flaresolverr.getStatus()
  assert.equal(deadStatus.configured, true)
  assert.equal(deadStatus.live, false)
  assert.match(deadStatus.error, /ECONNREFUSED/)
})

test('discoverWordPress falls back to FlareSolverr on Cloudflare 403 challenge and succeeds', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const fakeSolver = {
    isConfigured: () => true,
    getClearanceHeaders: () => ({}),
    isCloudflareChallenge: () => true,
    extractJsonFromSolutionResponse: flaresolverr.extractJsonFromSolutionResponse,
    solve: async ({ url }) => ({
      ok: true,
      status: 200,
      data: { namespaces: ['wp/v2', 'claude-bridge/v1'] },
      solution: { url },
    }),
  }

  const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
  // Direct fetch answers with Cloudflare challenge
  const fetchImpl = async () => new Response('<html><head><title>Just a moment...</title></head></html>', {
    status: 403,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
  })

  const result = await discoverWordPress('https://protected-wp.example.com', {
    resolve,
    fetchImpl,
    flaresolverrImpl: fakeSolver,
  })

  assert.equal(result.siteUrl, 'https://protected-wp.example.com')
  assert.equal(result.connectorDetected, true)
})

test('connector ping falls back to FlareSolverr when challenged by Cloudflare', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const origFetch = globalThis.fetch
  let fetchAttempts = 0
  globalThis.fetch = async (url) => {
    fetchAttempts++
    // Direct call to managed site fails with 403 Cloudflare challenge
    return new Response('<html><title>Just a moment...</title></html>', {
      status: 403,
      headers: { server: 'cloudflare', 'content-type': 'text/html' },
    })
  }

  flaresolverr._setFetchForTests(async (_ep, opts) => {
    const payload = JSON.parse(opts.body)
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        solution: {
          status: 200,
          response: JSON.stringify({ ok: true, version: '3.9.1' }),
        },
      }),
    }
  })

  try {
    const site = { url: 'https://behind-cf.test', secret: 'sec', siteKey: 'key' }
    const res = await ping(site)
    assert.equal(res.ok, true)
    assert.equal(res.version, '3.9.1')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('connector callTool solves challenge and retries POST with fresh clearance cookies', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const origFetch = globalThis.fetch
  let attempts = 0
  const seenCookies = []

  globalThis.fetch = async (url, opts) => {
    attempts++
    seenCookies.push(opts.headers['Cookie'])
    if (attempts === 1) {
      // First attempt has no clearance and gets Cloudflare challenge 403
      return new Response('<html><title>Just a moment...</title></html>', {
        status: 403,
        headers: { server: 'cloudflare', 'content-type': 'text/html' },
      })
    }
    // Second attempt has clearance cookies and succeeds!
    assert.match(opts.headers['Cookie'], /cf_clearance=cleared-token-abc/)
    return new Response(JSON.stringify({ result: { content: [{ type: 'text', text: '{"health":"good"}' }] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  flaresolverr._setFetchForTests(async () => {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        solution: {
          status: 200,
          cookies: [{ name: 'cf_clearance', value: 'cleared-token-abc', domain: '.behind-cf.test', expires: Math.floor(Date.now() / 1000) + 3600 }],
          userAgent: 'Mozilla/5.0 SolverTest',
          response: '<html>Home</html>',
        },
      }),
    }
  })

  try {
    const site = { url: 'https://behind-cf.test', secret: 'sec', siteKey: 'key' }
    const out = await callTool(site, 'health_check', {})
    assert.deepEqual(out, { content: [{ type: 'text', text: '{"health":"good"}' }] })
    assert.equal(attempts, 2)
  } finally {
    globalThis.fetch = origFetch
  }
})

test('checkMonitor uses FlareSolverr when target site returns Cloudflare challenge', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const origFetch = globalThis.fetch
  globalThis.fetch = async () => {
    return new Response('<html><title>Just a moment...</title></html>', {
      status: 503,
      headers: { server: 'cloudflare', 'cf-ray': '12345', 'content-type': 'text/html' },
    })
  }

  flaresolverr._setFetchForTests(async () => {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: 'ok',
        solution: {
          status: 200,
          cookies: [{ name: 'cf_clearance', value: 'cf-clear', expires: Math.floor(Date.now() / 1000) + 3600 }],
          userAgent: 'Mozilla/5.0 MonitorSolver',
          response: '<html><body>Welcome to My Protected WordPress Store</body></html>',
        },
      }),
    }
  })

  const { checkMonitor, _setRecordResultForTests } = await import('../src/monitors.runner.js')
  _setRecordResultForTests(async (mon, outcome) => outcome)

  try {
    const monitor = {
      id: 'm1',
      site_id: 's1',
      url: 'https://cf-protected-store.test',
      expect_status: 200,
      expect_contains: 'Welcome to My Protected WordPress Store',
    }

    const result = await checkMonitor(monitor)

    assert.equal(result.ok, true)
    assert.equal(result.status, 200)
    assert.equal(result.error, undefined)
  } finally {
    _setRecordResultForTests(null)
    globalThis.fetch = origFetch
  }
})

test('connector callTool throws ConnectorError on Cloudflare 200 challenge when solver fails (never returns empty object)', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const origFetch = globalThis.fetch
  // Target site returns 200 OK with Cloudflare challenge page
  globalThis.fetch = async () => new Response('<html><head><title>Just a moment...</title></head><body><div id="turnstile-widget"></div></body></html>', {
    status: 200,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
  })

  // FlareSolverr fails to solve
  flaresolverr._setFetchForTests(async () => {
    throw new Error('FlareSolverr timeout')
  })

  try {
    const site = { url: 'https://behind-cf.test', secret: 'sec', siteKey: 'key' }
    await assert.rejects(
      () => callTool(site, 'get_site_info', {}),
      (err) => {
        assert.equal(err.name, 'ConnectorError')
        return true
      }
    )
  } finally {
    globalThis.fetch = origFetch
  }
})

test('connector ping handles Cloudflare 200 challenge and falls back to solver', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const origFetch = globalThis.fetch
  // Direct fetch answers 200 OK with Cloudflare challenge
  globalThis.fetch = async () => new Response('<html><title>Just a moment...</title><body>Checking your browser before accessing</body></html>', {
    status: 200,
    headers: { server: 'cloudflare', 'cf-ray': 'ray-200', 'content-type': 'text/html' },
  })

  // Solver successfully solves and returns ping JSON
  flaresolverr._setFetchForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      status: 'ok',
      solution: {
        status: 200,
        response: JSON.stringify({ ok: true, version: '3.9.1' }),
      },
    }),
  }))

  try {
    const site = { url: 'https://behind-cf.test', secret: 'sec', siteKey: 'key' }
    const res = await ping(site)
    assert.equal(res.ok, true)
    assert.equal(res.version, '3.9.1')
  } finally {
    globalThis.fetch = origFetch
  }
})

test('connector ping throws ConnectorError on non-JSON response instead of unhandled SyntaxError', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: '' } })

  const origFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('<html><body>Welcome to My Blog</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })

  try {
    const site = { url: 'https://not-json.test', secret: 'sec', siteKey: 'key' }
    await assert.rejects(
      () => ping(site),
      (err) => {
        assert.equal(err.name, 'ConnectorError')
        assert.match(err.message, /non-JSON response/)
        return true
      }
    )
  } finally {
    globalThis.fetch = origFetch
  }
})

test('discoverWordPress rejects redirect to private destination via FlareSolverr', async () => {
  flaresolverr._setConfigForTests({ flaresolverr: { url: 'http://localhost:8191' } })

  const fakeSolver = {
    isConfigured: () => true,
    getClearanceHeaders: () => ({}),
    isCloudflareChallenge: () => true,
    extractJsonFromSolutionResponse: flaresolverr.extractJsonFromSolutionResponse,
    solve: async () => ({
      ok: true,
      status: 200,
      data: { namespaces: ['wp/v2', 'claude-bridge/v1'] },
      solution: { url: 'http://169.254.169.254/wp-json/' },
    }),
  }

  const resolve = async (host) => {
    if (host === '169.254.169.254') return [{ address: '169.254.169.254', family: 4 }]
    return [{ address: '93.184.216.34', family: 4 }]
  }

  const fetchImpl = async () => new Response('<html><head><title>Just a moment...</title></head></html>', {
    status: 403,
    headers: { server: 'cloudflare', 'content-type': 'text/html' },
  })

  await assert.rejects(
    () => discoverWordPress('https://protected-wp.example.com', {
      resolve,
      fetchImpl,
      flaresolverrImpl: fakeSolver,
    }),
    (err) => {
      assert.equal(err.i18n?.key, 'sites.publicAddressRequired')
      return true
    }
  )
})
