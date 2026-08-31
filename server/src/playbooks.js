import { existsSync, realpathSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const MAX_FILE_BYTES = 512 * 1024
let catalogCache = null
let rootCache = null

function playbooksRoot() {
  if (rootCache) return rootCache

  // Local checkout: ../../skills from server/src.
  // Production image: ../skills from /app/src after the Docker COPY.
  const candidates = [
    process.env.DIGIWP_SKILLS_DIR,
    resolve(here, '..', '..', 'skills'),
    resolve(here, '..', 'skills'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      rootCache = realpathSync(candidate)
      return rootCache
    }
  }

  const error = new Error('WordPress playbooks are unavailable')
  error.code = 'PLAYBOOKS_UNAVAILABLE'
  throw error
}

function frontmatter(markdown) {
  const block = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] || ''
  return {
    title: /^name:\s*(.+)$/m.exec(block)?.[1]?.trim() || '',
    description: /^description:\s*(.+)$/m.exec(block)?.[1]?.trim() || '',
  }
}

function filesBelow(root, current = root) {
  const files = []
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = resolve(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...filesBelow(root, absolute))
    } else if (entry.isFile()) {
      files.push(absolute.slice(root.length + 1).split(sep).join('/'))
    }
  }
  return files
}

export function playbookCatalog() {
  if (catalogCache) return catalogCache
  const root = playbooksRoot()
  const skills = []

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(entry.name)) continue
    const skillRoot = realpathSync(resolve(root, entry.name))
    const skillFile = resolve(skillRoot, 'SKILL.md')
    if (!existsSync(skillFile) || !statSync(skillFile).isFile()) continue

    const meta = frontmatter(readFileSync(skillFile, 'utf8'))
    skills.push({
      name: entry.name,
      title: meta.title || entry.name,
      description: meta.description,
      files: filesBelow(skillRoot).sort(),
    })
  }

  catalogCache = skills.sort((a, b) => a.name.localeCompare(b.name))
  return catalogCache
}

export function readPlaybook(name, file = 'SKILL.md') {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)) {
    const error = new Error('invalid playbook name')
    error.code = 'INVALID_PLAYBOOK'
    throw error
  }
  if (typeof file !== 'string' || file === '' || file.startsWith('/') || file.includes('\\')) {
    const error = new Error('invalid playbook file')
    error.code = 'INVALID_PLAYBOOK_FILE'
    throw error
  }
  const parts = file.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    const error = new Error('invalid playbook file')
    error.code = 'INVALID_PLAYBOOK_FILE'
    throw error
  }

  const skill = playbookCatalog().find((item) => item.name === name)
  if (!skill || !skill.files.includes(file)) {
    const error = new Error('playbook file not found')
    error.code = 'PLAYBOOK_NOT_FOUND'
    throw error
  }

  const root = playbooksRoot()
  const skillRoot = realpathSync(resolve(root, name))
  const absolute = realpathSync(resolve(skillRoot, ...parts))
  if (!absolute.startsWith(skillRoot + sep) || !statSync(absolute).isFile()) {
    const error = new Error('playbook file not found')
    error.code = 'PLAYBOOK_NOT_FOUND'
    throw error
  }
  if (statSync(absolute).size > MAX_FILE_BYTES) {
    const error = new Error('playbook file is too large')
    error.code = 'PLAYBOOK_TOO_LARGE'
    throw error
  }

  return readFileSync(absolute, 'utf8')
}
