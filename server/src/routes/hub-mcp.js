// ============================================================
// Hub MCP — one URL for every site, the way WPVibe works.
// ------------------------------------------------------------
// The per-site plugin already is an MCP server, but a client has to be given
// one URL and one token per site, and a site the client's own network cannot
// reach is simply out of reach. This endpoint is the other shape: an AI
// client connects once, to this server, with a personal token, and acts on
// any site its owner can reach — through the signed connector relay, and
// through the peer server when the site cannot be reached from here.
//
//   POST /v1/mcp            JSON-RPC 2.0 (MCP streamable HTTP, JSON answers)
//   Authorization: Bearer dwmcp_…   (or ?token=dwmcp_… for clients that only take a URL)
//
// Three tools: list_sites, site_tools, call_site_tool. The policy is the
// panel's own (/sites/:id/actions), not a new one:
//   - a team member may run read-only tools; every change stays with the owner;
//   - a sensitive tool (authority.js) never runs from here: it becomes a
//     proposal the owner approves in the panel, like WPVibe's approval link;
//   - a change that ran is written to the site's event log.
//
// Token management (/v1/account/mcp-tokens) is a normal signed-in route.
// ============================================================
import { Router } from 'express'
import { config, publicApiBase } from '../config.js'
import { sites } from '../store.js'
import { mcpTokens } from '../mcp-tokens.store.js'
import * as connector from '../connector.js'
import * as proposals from '../proposals.js'
import * as events from '../events.js'
import { classify } from '../authority.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { errorMessage, httpError } from '../i18n.js'

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_INFO = { name: 'digiwp-hub', version: '1.0.0' }

const INSTRUCTIONS =
  'DigiWP hub: manage every WordPress site you can reach from one connection. ' +
  'Call list_sites first, then site_tools to see what a site offers, then call_site_tool. ' +
  'Sites are reached through a signed relay (and through the partner server inside or outside Iran when a site cannot be reached directly). ' +
  'Sensitive tools are not run from here: they are filed as a proposal the site owner approves in the DigiWP panel.'

const TOOLS = [
  {
    name: 'list_sites',
    description: 'List every WordPress site you can manage here: id, address, your role (owner or team member), whether it is paired, and its assistant authority level.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'site_tools',
    description: 'List the tools one site offers (from its WP Claude Bridge plugin), each marked read / mutating / sensitive. `site` is a site id, its address, or its host name.',
    inputSchema: {
      type: 'object',
      properties: { site: { type: 'string', description: 'Site id, URL or host, from list_sites.' } },
      required: ['site'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'call_site_tool',
    description: 'Run one tool on one site. Read-only tools run for owners and team members; changes run for the owner only; sensitive tools (file edits, deletes, database, restores, publishing…) are filed as a proposal for the owner to approve in the panel and do not run immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'Site id, URL or host, from list_sites.' },
        tool: { type: 'string', description: 'Tool name, from site_tools.' },
        arguments: { type: 'object', description: 'The tool\'s arguments.', additionalProperties: true },
      },
      required: ['site', 'tool'],
      additionalProperties: false,
    },
  },
]

export const mcpRouter = Router()
export const mcpTokensRouter = Router()

// Before the token is checked: a token is 256 bits, so this is not about
// guessing — it keeps a flood of bad requests from becoming database load.
const ipLimit = limiter('hub-mcp-ip', {
  limit: 600,
  windowMs: 60 * 1000,
  keyFn: (req) => clientIp(req, { trustProxy: config.trustProxy }),
})

const mcpLimit = limiter('hub-mcp', {
  limit: 240,
  windowMs: 60 * 1000,
  keyFn: (req) => req.mcpUser?.tokenId || 'anonymous',
})

// String operations, not a regex: header and query are attacker-controlled.
function presentedToken(req) {
  const header = String(req.get('authorization') || '')
  if (header.slice(0, 7).toLowerCase() === 'bearer ') return header.slice(7).trim()
  return typeof req.query?.token === 'string' ? req.query.token.trim() : ''
}

function trimTrailingSlashes(value) {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end--
  return value.slice(0, end)
}

async function authenticate(req, res, next) {
  try {
    const user = await mcpTokens.resolve(presentedToken(req))
    if (!user) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="digiwp-hub"')
      return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: a valid DigiWP MCP token is required.' } })
    }
    req.mcpUser = user
    next()
  } catch (e) { next(e) }
}

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result })
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } })
const textResult = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
})

function hostOf(url) {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

/** Find one of the user's sites by id, full address or host name. */
export function pickSite(rows, ref) {
  const wanted = String(ref || '').trim()
  if (!wanted) return null
  const byId = rows.find((r) => r.id === wanted)
  if (byId) return byId
  const lower = trimTrailingSlashes(wanted.toLowerCase())
  const wantedHost = hostOf(/^https?:\/\//i.test(lower) ? lower : `https://${lower}`).replace(/^www\./, '')
  return rows.find((r) => {
    const url = trimTrailingSlashes(String(r.url || '').toLowerCase())
    if (url && url === lower) return true
    const h = hostOf(url || `https://${r.name}`).replace(/^www\./, '')
    return h && h === wantedHost
  }) || null
}

function describeSite(r) {
  return {
    id: r.id,
    url: r.url || null,
    name: r.title || r.name,
    role: r.member_role,
    paired: Boolean(r.paired),
    authority: r.authority,
  }
}

function panelLink(siteId) {
  const origin = /^https?:\/\//.test(config.corsOrigin || '') ? config.corsOrigin.replace(/\/+$/, '') : ''
  return origin ? `${origin}/site/${siteId}` : null
}

async function runTool(user, name, args = {}) {
  const rows = await sites.listAccessibleRaw(user.userId)

  if (name === 'list_sites') {
    return textResult({ sites: rows.map(describeSite) })
  }

  if (name !== 'site_tools' && name !== 'call_site_tool') {
    return textResult(`Unknown tool: ${name}`, true)
  }

  const site = pickSite(rows, args.site)
  if (!site) return textResult(`No site "${args.site ?? ''}" among the sites you can manage. Call list_sites.`, true)
  if (!site.paired || !site.url || !site.secret) {
    return textResult(`${site.url || site.name} is not paired with this server yet — install WP Claude Bridge there and complete Hub Connector pairing in the panel.`, true)
  }
  if (!config.live) {
    return textResult('Live relay is off on this server (LIVE=1 is not set), so nothing can be sent to sites.', true)
  }
  const target = { url: site.url, secret: site.secret, siteKey: site.site_key }

  if (name === 'site_tools') {
    const tools = await connector.listTools(target)
    return textResult({
      site: describeSite(site),
      tools: tools.map((t) => ({ name: t.name, kind: classify(t.name), description: t.description, inputSchema: t.inputSchema })),
    })
  }

  // call_site_tool
  const tool = String(args.tool || '').trim()
  const toolArgs = args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments) ? args.arguments : {}
  if (!tool) return textResult('`tool` is required.', true)
  const kind = classify(tool, toolArgs)

  if (kind !== 'read' && site.member_role !== 'owner') {
    return textResult(`Only the site owner can run "${tool}" (${kind}); as a team member you can run read-only tools.`, true)
  }

  if (kind === 'sensitive') {
    const proposal = await proposals.record({
      siteId: site.id, userId: user.userId, tool, args: toolArgs, kind,
      reason: 'Requested from an AI client over the DigiWP hub MCP.', authority: site.authority,
    })
    const link = panelLink(site.id)
    return textResult({
      ran: false,
      requiresApproval: true,
      proposalId: proposal?.id || null,
      message: `"${tool}" is sensitive, so it was not run. It is waiting for the owner's approval in the DigiWP panel${link ? ` (${link})` : ''}; once approved there it runs once.`,
    })
  }

  const result = await connector.callTool(target, tool, toolArgs)
  if (kind === 'mutating') {
    events.record({
      siteId: site.id, kind: 'action', severity: 'info',
      ...events.i18nTitle('sites.events.mcpRan', { op: tool }, { op: tool, args: toolArgs, via: 'hub-mcp', tokenId: user.tokenId }),
    }).catch(() => {})
  }
  return result && Array.isArray(result.content) ? result : textResult(result)
}

mcpRouter.get('/mcp', (_req, res) => {
  res.setHeader('Allow', 'POST')
  res.status(405).json({ message: 'Use POST with JSON-RPC 2.0 (MCP streamable HTTP).' })
})

mcpRouter.post('/mcp', ipLimit, authenticate, mcpLimit, async (req, res) => {
  const body = req.body
  if (Array.isArray(body)) {
    return res.json(rpcError(null, -32600, 'Batch requests are not supported.'))
  }
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return res.status(400).json(rpcError(null, -32600, 'Invalid JSON-RPC request.'))
  }
  const { id = null, method, params = {} } = body

  if (method.startsWith('notifications/')) return res.status(202).end()

  try {
    switch (method) {
      case 'initialize': {
        const asked = String(params?.protocolVersion || '')
        return res.json(rpcResult(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        }))
      }
      case 'ping':
        return res.json(rpcResult(id, {}))
      case 'tools/list':
        return res.json(rpcResult(id, { tools: TOOLS }))
      case 'tools/call': {
        const name = String(params?.name || '')
        try {
          return res.json(rpcResult(id, await runTool(req.mcpUser, name, params?.arguments || {})))
        } catch (e) {
          // A site that failed is a tool result the model can read and react
          // to, not a protocol failure that ends the conversation.
          return res.json(rpcResult(id, textResult(errorMessage('en', e) || 'The call failed.', true)))
        }
      }
      default:
        return res.json(rpcError(id, -32601, `Method not found: ${method}`))
    }
  } catch (e) {
    return res.status(500).json(rpcError(id, -32603, e.message || 'Internal error'))
  }
})

// ---- token management (signed-in hub user) ----

mcpTokensRouter.get('/account/mcp-tokens', async (req, res, next) => {
  try {
    res.json({ tokens: await mcpTokens.list(req.user.sub), mcpUrl: `${publicApiBase(req)}/mcp` })
  } catch (e) { next(e) }
})

mcpTokensRouter.post('/account/mcp-tokens', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim() || req.t('mcp.defaultName')
    const { token, record } = await mcpTokens.create(req.user.sub, name)
    // The token is shown here once and never again.
    res.status(201).json({ token, record, mcpUrl: `${publicApiBase(req)}/mcp` })
  } catch (e) { next(e) }
})

mcpTokensRouter.delete('/account/mcp-tokens/:id', async (req, res, next) => {
  try {
    if (!(await mcpTokens.revoke(req.user.sub, req.params.id))) throw httpError(404, 'mcp.tokenNotFound')
    res.json({ ok: true })
  } catch (e) { next(e) }
})
