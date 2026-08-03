// A SQL comment in one of the schema modules contained a backtick, which
// terminated the JavaScript template literal holding the DDL. The file still
// passed `node --check`; it failed only when the ES module loader compiled it,
// and the error named an identifier from the middle of a comment rather than
// the real cause.
//
// Every schema module is one big template literal, so the class recurs. This
// pins the class rather than the instance.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

test('no schema module contains a backtick inside its DDL literal', () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.schema.js'))
  assert.ok(files.length >= 3, 'the schema modules should be discoverable')

  for (const file of files) {
    const text = readFileSync(join(SRC, file), 'utf8')
    // Two backticks open and close the literal; a third is inside it.
    const count = (text.match(/`/g) || []).length
    assert.equal(
      count, 2,
      `${file} has ${count} backticks. A backtick inside the DDL — most often ` +
      `quoting a column name in a comment — ends the template literal early, ` +
      `and the syntax error it produces names something else entirely.`,
    )
  }
})

test('every schema module actually loads', async () => {
  // The check above is textual. This one compiles them, which is where the
  // original fault surfaced.
  for (const file of readdirSync(SRC).filter((f) => f.endsWith('.schema.js'))) {
    const mod = await import(`../src/${file}`)
    assert.equal(typeof mod.SCHEMA, 'string')
    assert.ok(mod.SCHEMA.includes('CREATE TABLE'), `${file} exports no DDL`)
  }
})
