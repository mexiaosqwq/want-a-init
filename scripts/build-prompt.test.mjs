import assert from 'node:assert'
import { buildPrompt } from '../lib/index.js'

const CWD = '/tmp/fake-repo'

// Merge mode (default): no overwrite, no guardrail, no user-quote line.
const merge = buildPrompt(CWD, '')
assert.match(merge, /Mode: merge-or-create\./)
assert.doesNotMatch(merge, /will be discarded/)
assert.doesNotMatch(merge, /The user also wrote/)
assert.match(merge, /## Docs/)
assert.match(merge, /Reconstruct recent history/)

// Force mode: guardrail present + no-rollback confirmation + missing-file escape hatch.
const force = buildPrompt(CWD, 'force')
assert.match(force, /Mode: overwrite\./)
assert.match(force, /will be discarded/)
assert.match(force, /NOT tracked by git/)
assert.match(force, /does not exist yet, skip the guardrail/)

// Free-form guidance: the verbatim input is quoted for the model to interpret.
const natural = buildPrompt(CWD, '别 force 覆盖，只补 Commands')
assert.match(natural, /The user also wrote: "别 force 覆盖，只补 Commands"/)
assert.match(natural, /Mode: merge-or-create\./)

// Minimal mode: 40-line goal + trimmed Layout tree.
const minimal = buildPrompt(CWD, 'minimal')
assert.match(minimal, /roughly 40 lines or fewer/)
assert.match(minimal, /keep the merged tree with counts/)
assert.match(merge, /sharing a naming pattern merge into one directory line with a count/)
assert.match(merge, /so is dumping every single file/)

// Shared skeleton present in every mode; CLAUDE.md banned everywhere.
for (const p of [merge, force, natural, minimal]) {
  assert.match(p, /never create CLAUDE\.md/)
  assert.match(p, /Distill, don't transcribe/)
}

console.log('build-prompt selftest: all assertions passed')
