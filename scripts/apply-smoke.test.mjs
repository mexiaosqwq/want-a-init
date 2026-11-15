// apply-layer smoke against the real 0.2.2-line @deepseek-ai/* import chain:
// command registration, injected-context delivery via agent.send, live cwd
// resolution, cancellation/error paths, and the enabled=false gate.
import assert from 'node:assert'
import { apply, SOURCE_KIND } from '../lib/index.js'

const signal = new AbortController().signal

function harness({ cwd = '/tmp/fake', service, logger, agentExtra = {} } = {}) {
  const registered = []
  const sections = []
  const agent = {
    session: { header: { cwd } },
    followup(msg) { this.msg = msg },
    send(msg, target, wakeup) { this.sent = { msg, target, wakeup } },
    ...agentExtra,
  }
  const ctx = {
    commands: { register: d => registered.push(d) },
    inject(_services, cb) {
      cb({ systemPrompt: { section: s => sections.push(s) } })
    },
    get(name) { return name === 'workingDirectory' ? service : undefined },
    logger,
  }
  apply(ctx, {})
  return { agent, registered, sections, run: (rawInput, sig = signal) => registered[0].handler({ agent, rawInput, signal: sig }) }
}

// Registration + the persistent system-prompt section.
{
  const h = harness({ service: { ensure: async () => '/live/cwd' } })
  assert.equal(h.registered.length, 1)
  const def = h.registered[0]
  assert.equal(def.name, 'init')
  assert.match(def.description, /AGENTS\.md/)
  assert.match(def.input.hint, /free-form guidance/)
  assert.equal(h.sections.length, 1)
  assert.equal(h.sections[0].name, 'agents-md-maintenance')
  // 650 sits between TEAM_POLICY (600) and PTC_ONLY (800) in the host's
  // SECTION_ORDERS: after every policy block, before the first tool section.
  assert.equal(h.sections[0].order, 650)
  // The section must not license creating AGENTS.md during ordinary tasks.
  assert.match(h.sections[0].text, /never create one mid-workflow/)
  assert.match(h.sections[0].text, /Default to NO EDIT/)
  assert.match(h.sections[0].text, /\(用户要求\)/)
  assert.match(h.sections[0].text, /Only AGENTS\.md is created or updated/)
  // Both guardrails that used to live only in the maintenance section now ride
  // inside DISTILL_RULE, so they must survive in the always-on text too.
  assert.match(h.sections[0].text, /deployment safety, external-contract compatibility, or production boundaries/)
  assert.match(h.sections[0].text, /No evidence, no rule/)
  assert.match(h.sections[0].text, /date stamps/)
  assert.match(h.sections[0].text, /verbatim user quotes/)
  // …but one-off /init-only guidance (the reference skeleton, the scoped
  // write-lock) must stay out of the per-round section.
  assert.doesNotMatch(h.sections[0].text, /## Project/)
  assert.doesNotMatch(h.sections[0].text, /Detail level:/)
}

// Main path: /init force is delivered as wake-up injected context, NOT a user turn.
{
  const h = harness({ service: { ensure: async () => '/live/cwd' } })
  const r = await h.run('force')
  assert.equal(r.kind, 'success')
  assert.equal(h.agent.msg, undefined, 'send path must not fall back to followup')
  const { msg, target, wakeup } = h.agent.sent
  assert.equal(target, 'next-step')
  assert.equal(wakeup, true)
  assert.equal(msg.role, 'user')
  assert.equal(typeof msg.id, 'string')
  assert.ok(Object.isFrozen(msg), 'createUserMessage must return an immutable message')
  assert.equal(msg.source.kind, SOURCE_KIND)
  assert.notEqual(msg.source.kind, 'user', 'context must not be attributed to the human')
  assert.equal(msg.source.form, 'notice')
  assert.equal(typeof msg.source.summary, 'string')
  assert.match(msg.content[0].text, /Mode: overwrite/)
  assert.match(msg.content[0].text, /\/live\/cwd/, 'prompt must use the live working directory')
}

// Runtimes without agent.send still deliver (followup fallback).
{
  const h = harness({ service: { ensure: async () => '/live/cwd' }, agentExtra: { send: undefined } })
  const r = await h.run('')
  assert.equal(r.kind, 'success')
  assert.equal(h.agent.sent, undefined)
  assert.equal(h.agent.msg.source.kind, SOURCE_KIND)
}

// No workingDirectory service composed -> creation-time header cwd.
{
  const h = harness({ cwd: '/header/dir' })
  const r = await h.run('')
  assert.equal(r.kind, 'success')
  assert.match(h.agent.sent.msg.content[0].text, /\/header\/dir/)
}

// ensure() failure is warned and falls back to the header cwd (no data loss).
{
  const warns = []
  const h = harness({ cwd: '/hdr', service: { ensure: async () => { throw new Error('boom') } }, logger: { warn: (...a) => warns.push(a) } })
  const r = await h.run('')
  assert.equal(r.kind, 'success')
  assert.match(h.agent.sent.msg.content[0].text, /\/hdr/)
  assert.equal(warns.length, 1)
  assert.match(warns[0][0], /working directory lookup failed/)
}

// Cancellation before start: no delivery at all.
{
  const h = harness({ service: { ensure: async () => '/live/cwd' } })
  const ac = new AbortController()
  ac.abort()
  const r = await h.run('force', ac.signal)
  assert.equal(r.kind, 'error')
  assert.equal(h.agent.sent, undefined)
  assert.equal(h.agent.msg, undefined)
}

// ensure() rejects after cancellation: propagate so commands.execute can settle it.
{
  const ac = new AbortController()
  const h = harness({ service: { ensure: async () => { ac.abort(); throw new Error('aborted work') } } })
  await assert.rejects(h.run('', ac.signal), /aborted work/)
  assert.equal(h.agent.sent, undefined)
}

// Missing cwd: clean error, no delivery. (agentExtra overrides the harness's
// default cwd; passing `cwd: undefined` would hit the destructuring default.)
{
  const h = harness({ agentExtra: { session: { header: {} } } })
  const r = await h.run('')
  assert.equal(r.kind, 'error')
  assert.equal(h.agent.sent, undefined)
}

// Option feedback is preserved in the human-facing result text.
{
  const h = harness({ service: { ensure: async () => '/live/cwd' } })
  const conflict = await h.run('minimal detailed')
  assert.match(conflict.text, /both minimal and detailed/)
  const natural = await h.run('只补 Commands')
  assert.match(natural.text, /interpreted as guidance/)
  assert.match(h.agent.sent.msg.content[0].text, /只补 Commands/)
}

// enabled=false gates ONLY the persistent section; /init still registers.
{
  const registered = []
  apply({
    commands: { register: d => registered.push(d) },
    inject: () => { throw new Error('enabled=false must not inject systemPrompt') },
  }, { enabled: false })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'init')
}

console.log('apply-smoke selftest: all assertions passed')
