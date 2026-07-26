import { Router } from 'express'
import crypto from 'node:crypto'
import { RECIPES } from '../cookbook/recipes.js'

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

export default router
