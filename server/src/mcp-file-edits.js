import { sites } from './store.js'
import { callTool, ConnectorError } from './connector.js'
import * as events from './events.js'
import { errorMessage, httpError } from './i18n.js'

const PATH = /^(plugins|themes|mu-plugins)(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+$/

function validPath(path) {
  return typeof path === 'string' && path.length <= 512 && PATH.test(path) && !/[\r\n]/.test(path)
}

export async function validateFileEditGrant(userId, grant) {
  if (grant === undefined || grant === null) return null
  const { siteId, paths } = grant
  if (typeof siteId !== 'string' || !Array.isArray(paths) || paths.length < 1 || paths.length > 50 || !paths.every(validPath)) {
    throw httpError(400, 'mcp.invalidFileEditGrant')
  }
  return { siteId: await ownedEditSite(userId, siteId), paths: [...new Set(paths)] }
}

export async function validateEditWindowGrant(userId, { siteId, paths, allFiles, hours }) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) throw httpError(400, 'mcp.editWindowDuration')
  // Older clients can still open a scoped window. An unrestricted list of
  // editable paths requires an explicit allFiles choice in the request.
  if (allFiles === undefined) return { ...await validateFileEditGrant(userId, { siteId, paths }), hours }
  if (allFiles !== true || paths !== undefined || typeof siteId !== 'string' || !siteId) {
    throw httpError(400, 'mcp.invalidEditWindow')
  }
  return { siteId: await ownedEditSite(userId, siteId), paths: null, hours }
}

async function ownedEditSite(userId, siteId) {
  const site = await sites.rawForUser(siteId, userId)
  if (!site || site.status === 'deleted') throw httpError(404, 'mcp.fileEditOwnerRequired')
  return site.id
}

export function isGrantedEdit(user, site, args) {
  const grant = fileEditGrant(user, site)
  return grant !== null && !args.theme && validPath(args.path) &&
    ((!user.fileEdit && grant.paths === null) || (Array.isArray(grant.paths) && grant.paths.includes(args.path)))
}

export function fileEditGrant(user, site) {
  const temporary = user.editWindow
  const grant = user.fileEdit || (temporary?.expiresAt > Date.now() ? temporary : null)
  return site.member_role === 'owner' && grant?.siteId === site.id ? grant : null
}

export async function relayFileEdit(user, site, target, args) {
  // Persist the attempt before sending a signed write. Record the tool outcome
  // against the same event so a dropped connection leaves a visible attempt.
  const action = { op: 'edit_file', path: args.path, tokenId: user.tokenId, by: user.userId, via: 'hub-mcp-file-edit' }
  const start = await events.record({
    siteId: site.id, kind: 'action',
    ...events.i18nTitle('mcp.fileEditStarted', { path: args.path }, { ...action, outcome: 'unconfirmed' }),
  })
  let result
  let error
  try {
    result = await callTool(target, 'edit_file_with_backup', {
      path: args.path, search: args.search, replace: args.replace, replace_all: args.replace_all,
    })
  } catch (e) {
    error = e
  }

  let backupId
  try { backupId = JSON.parse(result?.content?.[0]?.text || 'null')?.backup_id } catch { /* invalid tool response */ }
  const ok = !result?.isError && typeof backupId === 'string' && /^[a-f0-9]{32}$/.test(backupId)
  if (ok) {
    await events.finishAction(start.id, 'info', events.i18nTitle('mcp.fileEditRan', { path: args.path }, { ...action, outcome: 'performed', backupId }))
    return result
  }

  const failed = result?.isError || (error instanceof ConnectorError && Boolean(error.reason))
  await events.finishAction(start.id, 'warning', events.i18nTitle(failed ? 'mcp.fileEditFailed' : 'mcp.fileEditUnconfirmed',
    { path: args.path }, { ...action, outcome: failed ? 'failed' : 'unconfirmed' }))
  const upstream = result?.content?.[0]?.text
  const message = upstream === 'Unknown tool: edit_file_with_backup'
    ? 'Update DigiWP Ai Bridge on this site to 3.9.5 or later to use direct editing with backups.'
    : (upstream || (error && errorMessage('en', error)) || 'The connector did not confirm a backed-up edit.')
  return { isError: true, content: [{ type: 'text', text: message }] }
}
