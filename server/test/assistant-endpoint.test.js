// ASSISTANT_URL is written by a person, and the two natural ways to write an
// OpenAI-compatible base URL must both work. Getting this wrong produces a 404
// that reads as "the assistant is not answering" — no error mentions the URL.
import test from 'node:test'
import assert from 'node:assert/strict'

import { completionsEndpoint } from '../src/assistant.js'

const EXPECTED = 'https://gate.nabuxai.com/v1/chat/completions'

test('a base URL without /v1 works', () => {
  assert.equal(completionsEndpoint('https://gate.nabuxai.com'), EXPECTED)
})

test('a base URL with /v1 is not doubled', () => {
  // The published address of our own gateway ends in /v1, so this is the value
  // someone is most likely to paste.
  assert.equal(completionsEndpoint('https://gate.nabuxai.com/v1'), EXPECTED)
})

test('trailing slashes are tolerated in either form', () => {
  assert.equal(completionsEndpoint('https://gate.nabuxai.com/'), EXPECTED)
  assert.equal(completionsEndpoint('https://gate.nabuxai.com/v1/'), EXPECTED)
  assert.equal(completionsEndpoint('https://gate.nabuxai.com/v1///'), EXPECTED)
})

test('a path that merely contains v1 is left alone', () => {
  // Only a trailing /v1 is a version prefix; /apiv1 or /v1beta are paths.
  assert.equal(
    completionsEndpoint('https://example.test/apiv1'),
    'https://example.test/apiv1/v1/chat/completions'
  )
})

test('an empty URL does not throw', () => {
  // The caller checks for a configured URL first, but this must not be the
  // thing that crashes if that check is ever moved.
  assert.equal(completionsEndpoint(''), '/v1/chat/completions')
  assert.equal(completionsEndpoint(undefined), '/v1/chat/completions')
})
