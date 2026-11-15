import assert from 'node:assert'
import { parseOptions } from '../lib/index.js'

// Pure-options mode: bare tokens in any order, case-insensitive.
assert.deepEqual(parseOptions('force'), { force: true, minimal: false, detailed: false, conflict: false, naturalLanguage: false })
assert.deepEqual(parseOptions('MINIMAL, detailed'), { force: false, minimal: true, detailed: true, conflict: true, naturalLanguage: false })
assert.deepEqual(parseOptions('minimal force'), { force: true, minimal: true, detailed: false, conflict: false, naturalLanguage: false })

// Free-form guidance (incl. negations) must NOT trigger options — the model interprets it.
const negate = parseOptions('别 force 覆盖，只补 Commands')
assert.equal(negate.force, false)
assert.equal(negate.naturalLanguage, true)
assert.equal(parseOptions('only fill in the Commands section').naturalLanguage, true)

// Near-miss tokens are not options (no silent prefix guessing).
assert.equal(parseOptions('min').naturalLanguage, true)
assert.equal(parseOptions('forced').naturalLanguage, true)

// Empty input: plain default mode, NOT free-form guidance (empty-quote bug guard).
assert.deepEqual(parseOptions(''), { force: false, minimal: false, detailed: false, conflict: false, naturalLanguage: false })

console.log('parse-options selftest: all assertions passed')
