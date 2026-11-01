import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { Readable } from 'node:stream'
import { parse } from 'tldts'
import { httpError } from './i18n.js'

// Keep the installation path. Pasting a dashboard or REST address should not
// turn /shop/wp-admin into /shop/wp-admin/wp-json, or discard /shop entirely.
export function normalizeSiteAddress(input) {
  if (typeof input !== 'string' || !input.trim()) throw httpError(400, 'sites.domainRequired')
  const raw = input.trim()
  let url
  try { url = new URL(/^[a-z][\w+.-]*:/i.test(raw) && !/^[^/]+:\d+(?:\/|$)/.test(raw) ? raw : `https://${raw}`) } catch { throw httpError(400, 'sites.invalidAddress') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || /\s/.test(raw)) {
    throw httpError(400, 'sites.invalidAddress')
  }
  url.pathname = url.pathname.replace(/\/(?:wp-admin(?:\/.*)?|wp-login\.php|wp-json(?:\/.*)?|index\.php)\/?$/i, '').replace(/\/+$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.href.replace(/\/$/, '')
}

export function siteLocation(address) {
  const url = new URL(address)
  const { subdomain } = parse(url.hostname, { allowPrivateDomains: true })
  const sub = subdomain === 'www' ? '' : (subdomain || '').replace(/^www\./, '')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  return { hostname: url.host, path, subdomain: sub, kind: path !== '/' ? (sub ? 'subdomain-subfolder' : 'subfolder') : (sub ? 'subdomain' : 'root') }
}

const blocked = new BlockList()
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]]) blocked.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blocked.addSubnet(network, prefix, 'ipv6')

async function publicAddress(url, resolve, signal) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw httpError(400, 'sites.invalidAddress')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let abort
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
    resolve(host, { all: true }),
    new Promise((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    }),
  ]).finally(() => signal.removeEventListener('abort', abort))
  if (!addresses.length || addresses.some(({ address, family }) => family === 4 ? blocked.check(address, 'ipv4') : !/^[23][0-9a-f]{3}:/i.test(address) || blocked.check(address, 'ipv6'))) throw httpError(400, 'sites.publicAddressRequired')
  return addresses
}

function publicFetch(address, { signal, headers }, addresses) {
  // Pin the socket to the DNS answers we just validated. A second DNS lookup
  // by fetch would permit a public-to-private DNS rebinding between checks.
  return new Promise((resolve, reject) => {
    const url = new URL(address)
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      signal, headers, agent: false,
      lookup: (_hostname, options, callback) => options.all
        ? callback(null, addresses)
        : callback(null, addresses[0].address, addresses[0].family),
    }, (res) => {
      const headers = Object.fromEntries(Object.entries(res.headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]))
      resolve(new Response([204, 205, 304].includes(res.statusCode) ? null : Readable.toWeb(res), { status: res.statusCode, headers }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function getJson(address, { fetchImpl, resolve, signal }) {
  let url = new URL(address)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await publicAddress(url, resolve, signal)
    signal.throwIfAborted()
    const res = await fetchImpl(url.href, { redirect: 'manual', signal, headers: { Accept: 'application/json' } }, addresses)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      await res.body?.cancel()
      if (!location) return null
      url = new URL(location, url)
      continue
    }
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) { await res.body?.cancel(); return null }
    // REST indexes can be large, but neither memory nor the request is unbounded.
    const reader = res.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 4 * 1024 * 1024) return null
        chunks.push(Buffer.from(value))
      }
      return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), url }
    } finally { await reader.cancel() }
  }
  return null
}

export async function discoverWordPress(input, { fetchImpl = publicFetch, resolve = lookup } = {}) {
  const siteUrl = normalizeSiteAddress(input)
  const signal = AbortSignal.timeout(12000)
  let failure
  try {
    const result = await getJson(`${siteUrl}/wp-json/?_fields=namespaces`, { fetchImpl, resolve, signal })
    if (!result || !Array.isArray(result.data?.namespaces) || !result.data.namespaces.includes('wp/v2')) throw httpError(422, 'sites.wordpressNotFound')
    // Use the final REST location, never an arbitrary URL supplied in JSON.
    // This preserves /baneh, including when a host adds www or HTTPS.
    const resolved = normalizeSiteAddress(result.url.href)
    return { siteUrl: resolved, ...siteLocation(resolved), connectorDetected: result.data.namespaces.includes('claude-bridge/v1') }
  } catch (e) {
    if (['sites.publicAddressRequired', 'sites.invalidAddress'].includes(e.i18n?.key)) throw e
    failure = e
  }
  throw httpError(422, signal.aborted || failure?.name === 'TimeoutError' ? 'sites.discoveryTimeout' : 'sites.wordpressNotFound')
}
