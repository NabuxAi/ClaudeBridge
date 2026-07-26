import { Router } from 'express'
import crypto from 'node:crypto'
import { RECIPES } from '../cookbook/recipes.js'
import { pack as signaturePack } from '../intel/signatures.js'

// ============================================================
// The cookbook, served from here instead of shipped inside every site.
//
// It lived as 572 lines inside the connector plugin, which meant a new recipe
// reached customers only when they updated the plugin — and the sites that most
// need good playbooks are exactly the ones running a build from last year.
//
// Serving it centrally also keeps the plugin thin on machines we do not
// control, and lets a recipe be corrected in one place once it turns out to
// give bad advice.
//
// Public and unauthenticated on purpose: these are prompts, not secrets, and
// requiring a token would mean a site that has lost its pairing also loses its
// playbooks at the exact moment someone is trying to fix it.
// ============================================================

const router = Router()

// One ETag for the whole set. Sites poll daily; without it they would
// re-download an identical payload every time, for every customer.
const payload = JSON.stringify({ version: 1, count: RECIPES.length, recipes: RECIPES })
const etag = '"' + crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32) + '"'

router.get('/cookbook', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600')
  res.set('ETag', etag)
  if (req.headers['if-none-match'] === etag) return res.status(304).end()
  res.type('application/json').send(payload)
})

router.get('/cookbook/:id', (req, res) => {
  const recipe = RECIPES.find((r) => r.id === req.params.id)
  if (!recipe) return res.status(404).json({ message: 'recipe not found' })
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(recipe)
})

/**
 * The malware signature pack.
 *
 * Sites fetch this instead of reaching GitHub themselves: we absorb the rate
 * limit, no customer's IP is logged against a security feed, and a site that
 * happens to be offline during a refresh is not stranded on old rules.
 *
 * ETagged because a site polls daily and the pack rarely changes — without it
 * every site re-downloads an identical payload every day.
 */
let cachedPack = null
let cachedEtag = null
let cachedAt = 0

// The connector in the field asks for /security/signatures and expects a flat
// list. Both shapes are served from the same data: sites are running builds we
// do not control, and a scanner that quietly stops updating because an endpoint
// moved is worse than one that never moved.
router.get('/security/signatures', async (req, res, next) => {
  try {
    const p = await signaturePack()
    // Flattened for the older client, but only rules it can honour: a rule with
    // a threshold above one becomes a false-positive generator once its strings
    // are matched independently, so those are held back rather than degraded.
    const flat = []
    for (const rule of p.rules) {
      if (rule.min_hits > 1) continue
      for (const s of rule.strings) {
        flat.push({ id: rule.name, pattern: s.v, severity: rule.severity, nocase: !!s.i })
      }
    }
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({ version: p.version, updated_at: p.updated_at, signatures: flat, attribution: p.attribution })
  } catch (e) { next(e) }
})

router.get('/signatures', async (req, res, next) => {
  try {
    // Rebuilt at most once a minute; the query joins every rule to every string.
    if (!cachedPack || Date.now() - cachedAt > 60_000) {
      cachedPack = JSON.stringify(await signaturePack())
      cachedEtag = '"' + crypto.createHash('sha256').update(cachedPack).digest('hex').slice(0, 32) + '"'
      cachedAt = Date.now()
    }
    res.set('Cache-Control', 'public, max-age=3600')
    res.set('ETag', cachedEtag)
    if (req.headers['if-none-match'] === cachedEtag) return res.status(304).end()
    res.type('application/json').send(cachedPack)
  } catch (e) { next(e) }
})

export default router
