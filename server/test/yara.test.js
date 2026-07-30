// The signature bank decides whether a customer is told their site is infected.
// Every case here is a false positive that was actually produced during
// development, or the mechanism that stops one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRules, minHits, ruleMatches, isSpecific} from '../src/intel/yara.js'

const RULE = `
rule WEBSHELL_PHP_Test : FILE {
    meta:
        description = "test shell"
        author = "someone"
        license = "DRL 1.1"
        score = 75
    strings:
        $a = "eval(base64_decode" nocase
        $b = "gzinflate(base64_decode"
        $c = "str_rot13("
    condition:
        2 of them
}
`

test('a rule keeps its strings, threshold and attribution', () => {
  const [r] = parseRules(RULE)
  assert.equal(r.name, 'WEBSHELL_PHP_Test')
  assert.equal(r.strings.length, 3)
  assert.equal(r.min_hits, 2)
  assert.equal(r.severity, 'critical', 'score 75 is critical')
  assert.equal(r.author, 'someone')
  assert.equal(r.license, 'DRL 1.1', 'attribution must survive ingest')
})

test('the threshold is honoured: one hit is not enough', () => {
  const [r] = parseRules(RULE)
  assert.equal(ruleMatches(r, 'harmless str_rot13( usage'), false, 'one of three must not fire')
  assert.equal(ruleMatches(r, 'eval(base64_decode + str_rot13('), true, 'two of three fires')
})

test('nocase is applied only where the rule asked for it', () => {
  const [r] = parseRules(RULE)
  assert.equal(ruleMatches(r, 'EVAL(BASE64_DECODE and STR_ROT13('), false,
    'the case-sensitive string must not match uppercase')
  assert.equal(ruleMatches(r, 'EVAL(BASE64_DECODE and str_rot13('), true)
})

// The bug that produced ten false positives on ordinary source code.
test('ANDed subset clauses add up instead of taking the first number', () => {
  const body = `
    strings:
        $x = "aaaaa"
    condition:
        filesize < 100KB and 1 of ($ext*) and 2 of ($susp*)
  `
  assert.equal(minHits(body, 40), 3, '1 + 2, not 1')
})

test('ORed subset clauses take the cheapest, since either can satisfy', () => {
  const body = `
    strings:
        $x = "aaaaa"
    condition:
        3 of ($a*) or 1 of ($b*)
  `
  assert.equal(minHits(body, 40), 1)
})

test('an unmodelled condition demands every string, not one', () => {
  const body = `
    strings:
        $x = "aaaaa"
    condition:
        $x at 0 and something_we_do_not_parse
  `
  assert.equal(minHits(body, 12), 12, 'fall back to strict, never to loose')
})

test('rules for other languages are dropped', () => {
  const jsp = `
rule WEBSHELL_JSP_Generic : FILE {
    strings:
        $a = "request"
        $b = "getParameter"
    condition:
        any of them
}
`
  assert.equal(parseRules(jsp).length, 0, 'a JSP rule cannot fire honestly on a PHP site')
  assert.equal(parseRules(jsp, { phpOnly: false }).length, 1, 'but the filter is optional')
})

test('a many-string rule that parsed down to a threshold of one is discarded', () => {
  const strings = Array.from({ length: 20 }, (_, i) => `        $s${i} = "token${i}"`).join('\n')
  const loose = `
rule WEBSHELL_PHP_Loose : FILE {
    strings:
${strings}
    condition:
        any of them
}
`
  assert.equal(parseRules(loose).length, 0,
    'twenty strings behind a threshold of one is a mis-parse, not a rule')
})

test('strings too short to be signatures are ignored', () => {
  const tiny = `
rule WEBSHELL_PHP_Tiny : FILE {
    strings:
        $a = "ab"
        $b = "exec"
        $c = "verylongenoughstring"
    condition:
        all of them
}
`
  const [r] = parseRules(tiny)
  assert.deepEqual(r.strings.map((s) => s.value), ['verylongenoughstring'],
    'two and four character tokens match everything')
})

// ---------------------------------------------------------------
// The specificity filter, added after a real scan on a real site.
//
// WEBSHELL_Generic_OS_Strings shipped with 28 strings — including `<?php`,
// `public`, `throws` and `getValue` — and a threshold of 2. On a healthy
// WordPress install it reported 17,066 suspicious files out of 28,568. Sixty
// per cent of the site, WordPress core included.
// ---------------------------------------------------------------

test('a rule whose strings are language furniture is dropped', () => {
  const rule = {
    name: 'WEBSHELL_Generic_OS_Strings',
    min_hits: 2,
    strings: [
      { value: '<?php' }, { value: 'public' }, { value: 'throws' },
      { value: 'getValue' }, { value: 'java.lang.' }, { value: '="java.' },
      { value: '<?xml version' }, { value: 'evil-marker-9000' },
    ],
  }
  assert.equal(isSpecific(rule), false,
    'every PHP file contains two of these — this rule says "is a file", not "is malware"')
})

test('a big rule needs a threshold that is a real share of its strings', () => {
  const strings = Array.from({ length: 28 }, (_, i) => ({ value: `distinctive_marker_${i}` }))
  assert.equal(isSpecific({ name: 'R', min_hits: 2, strings }), false, '2 of 28 is a coin toss')
  assert.equal(isSpecific({ name: 'R', min_hits: 7, strings }), true, '7 of 28 is a signature')
})

test('a small precise rule is left alone', () => {
  // This is what a good signature looks like, and the filter must not eat it.
  assert.equal(isSpecific({
    name: 'EncodedLoader', min_hits: 1,
    strings: [{ value: 'gzinflate(base64_decode(' }, { value: 'eval(base64_decode(' }],
  }), true)
})

test('a rule with some generic strings but real markers survives', () => {
  // Dropping anything that merely mentions `public` would throw away good
  // rules. The test is whether the generic tokens dominate.
  const rule = {
    name: 'RealShell', min_hits: 3,
    strings: [
      { value: 'public' },
      { value: 'c99shell' }, { value: 'FilesMan' }, { value: 'b374k' },
      { value: '$_POST[\'cmd\']' }, { value: 'passthru(' },
    ],
  }
  assert.equal(isSpecific(rule), true)
})
