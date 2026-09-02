import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookbookRouter from '../src/routes/cookbook.js'

async function withServer(run) {
  const app = express()
  app.use('/v1', cookbookRouter)
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  try {
    const { port } = server.address()
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('playbook catalog exposes all repository playbooks without physical paths', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/skills`)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /public/)

    const body = await response.json()
    assert.equal(body.count, 18)
    assert.equal(body.skills.length, 18)
    const security = body.skills.find((skill) => skill.name === 'wp-security-review')
    assert.ok(security)
    assert.ok(security.files.includes('SKILL.md'))
    assert.ok(security.files.includes('references/vulnerability-patterns.md'))
    assert.doesNotMatch(JSON.stringify(body), /[A-Z]:\\|\/home\/|\/app\/skills/)
  })
})

test('one requested playbook file can be loaded on demand', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/skills/wp-security-review?file=SKILL.md`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.skill, 'wp-security-review')
    assert.equal(body.file, 'SKILL.md')
    assert.match(body.content, /WordPress Security Review/)
  })
})

test('playbook endpoint rejects traversal and unknown files', async () => {
  await withServer(async (base) => {
    const traversal = await fetch(`${base}/v1/skills/wp-security-review?file=../SKILL.md`)
    assert.equal(traversal.status, 400)

    const encodedTraversal = await fetch(`${base}/v1/skills/wp-security-review?file=references%2F..%2FSKILL.md`)
    assert.equal(encodedTraversal.status, 400)

    const missing = await fetch(`${base}/v1/skills/wp-security-review?file=references%2Fmissing.md`)
    assert.equal(missing.status, 404)

    const badName = await fetch(`${base}/v1/skills/not_a_skill`)
    assert.equal(badName.status, 400)
  })
})
