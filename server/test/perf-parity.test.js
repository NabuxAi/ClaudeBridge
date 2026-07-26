// The hub ships its own copy of the recipe book, because the hub image
// contains only hub/ and cannot import across into server/. A copy is fine;
// a copy that drifts is not — the demo would start giving advice the product
// does not give. This fails the build the moment they diverge.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('the hub copy of the recipe book is identical to the server one', () => {
  const server = readFileSync(join(root, 'server/src/perf/recipes.js'), 'utf8')
  const hub = readFileSync(join(root, 'hub/src/lib/perf-recipes.js'), 'utf8')
  assert.equal(hub, server,
    'hub/src/lib/perf-recipes.js has drifted — re-copy it from server/src/perf/recipes.js')
})
