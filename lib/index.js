/**
 * want-a-init — model-driven /init command for DeepSeek Harness.
 *
 * Injects a focused prompt into the agent so the model analyzes the project
 * and writes/updates a concise, high-signal AGENTS.md. Only AGENTS.md is
 * maintained; CLAUDE.md is intentionally not created.
 *
 * Options (rawInput): bare option tokens (force | minimal | detailed, any
 * order, comma/space separated) are parsed strictly; anything else is treated
 * as free-form guidance and passed to the model verbatim — the model, not a
 * regex, interprets it, so negations like "别 force" cannot misfire.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'

export const name = 'init-command'
export const inject = ['commands']

// Plugin config (0.2 contract: static Config, defaults in the schema).
// `enabled` gates the persistent agents-md-maintenance system-prompt section;
// the /init command itself stays available either way.
export const Config = z.object({
  enabled: z.boolean().default(true),
})

// Single source of truth for rules that appear in more than one prompt
// (command prompt + persistent maintenance section) so wording cannot drift.
const ONLY_AGENTS_MD = 'Only AGENTS.md is created or updated; never create CLAUDE.md or any other file as a substitute.'

const DISTILL_RULE = 'Distill, don\'t transcribe: capture only what a different future task would otherwise need re-reminded of (must-follow rules, exact commands, recurring pitfalls); exclude one-off task details (feature-specific values, configs from a single change, incident write-ups, work logs) — they bloat the file and dilute what matters; write each entry as a reusable rule (what breaks -> why -> what to do), allowing a past incident only as a one-line evidence tag on the rule it justifies.'

export function parseOptions(rawInput) {
  const raw = String(rawInput || '')
  const tokens = raw.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  const known = ['force', 'minimal', 'detailed']
  // Pure-options mode only when the input (ignoring whitespace/commas) is made
  // of known option words; otherwise it is free-form guidance for the model.
  const stripped = raw.replace(/[\s,，、]+/g, '')
  const pure = stripped.length > 0 && /^[a-z]+$/i.test(stripped) && tokens.every(t => known.includes(t))
  return {
    force: pure && tokens.includes('force'),
    minimal: pure && tokens.includes('minimal'),
    detailed: pure && tokens.includes('detailed'),
    conflict: pure && tokens.includes('minimal') && tokens.includes('detailed'),
    // Empty input is plain default mode, NOT free-form guidance — otherwise the
    // prompt would quote an empty user message back at the model.
    naturalLanguage: !pure && stripped.length > 0,
  }
}

export function buildPrompt(cwd, rawInput) {
  const { force, minimal, detailed, naturalLanguage } = parseOptions(rawInput)

  const mode = force ? 'overwrite' : 'merge-or-create'
  const lengthGoal = minimal
    ? 'Aim for a very compact file — roughly 40 lines or fewer. Only the highest-signal facts that an agent would likely get wrong without help.'
    : detailed
      ? 'You may be more thorough, but still avoid fluff: every line must earn its place in context.'
      : 'Keep it concise and practical — ideally under 200 lines, and much shorter for simple repos. Prefer short sections and bullets.'

  const lines = [
    `Run /init for the project at \`${cwd}\`.`,
    '',
    `Mode: ${mode}.`,
    force
      ? 'The user explicitly asked to force regenerate, so you may overwrite AGENTS.md. Guardrail: first list in your reply the existing entries that will be discarded (one line each). If AGENTS.md is tracked by git, you may proceed in the same turn — the old version stays recoverable. If it is NOT tracked by git, present the discard list and wait for explicit user confirmation before writing, since there is no rollback. If AGENTS.md does not exist yet, skip the guardrail and just create it.'
      : 'If AGENTS.md already exists, read it first and improve it in place rather than blindly replacing. Preserve verified useful guidance, delete stale or generic content, and reconcile it with the current codebase.',
    ...(naturalLanguage
      ? [
          `The user also wrote: "${rawInput}". Interpret it yourself: if it clearly asks to overwrite/regenerate, treat that as force (with the guardrail above); a negation means the opposite; requests for brevity or thoroughness adjust the length goal. When in doubt, prefer merge mode and ask.`,
          '',
        ]
      : []),
    'Goal: create or improve `AGENTS.md` so future agent sessions in this repo can avoid mistakes and ramp up quickly. ' + ONLY_AGENTS_MD,
    '',
    'Treat `AGENTS.md` as a living form to fill in from repository evidence, not as a free-form essay. Every rule, placement convention, and routing line below is judged by what this repo actually contains and how it actually works — the skeleton is a mechanism, never a fixed template. Use this skeleton and fill every section that applies:',
    '```markdown',
    '# <repository name>',
    '',
    '## Project',
    '- Type / role of the project, real entrypoints, package boundaries, and what lives where.',
    '',
    '## Layout',
    '- Annotated repo tree — a dense map: not a breezy list, and not an exhaustive dump. Tree glyphs (├─ └─). Files sharing a naming pattern merge into one directory line with a count (e.g. "tests/ ← 31 .test.ts (node --test)", "effects/ ← 17 modules: phone-chrome · gesture-guard · …"); list a file on its own line only when it has its own story (entrypoint, core module, trap). Annotations follow the repo\'s reality — gotcha where real, "generated, do not edit" where true — never invented. A top-level-only skeleton or bare uncounted paths is noise; so is dumping every single file. Mandatory for multi-file repos — in minimal mode keep the merged tree with counts, annotate only the trap-prone entries; skip only for single-file repos.',
    '',
    '## Docs',
    '- Document routing table — agents create great docs and then never read them again; this table is what keeps them alive. One line per long-lived document a different task would plausibly need: "<when to read it> -> <path> (<what question it answers>)". Example: "Before changing gesture behavior -> docs/specs/sidebar-swipe-gestures.md (state machine, gesture parameters, what must not change)". Scan docs/; skip one-off reports. A doc with no line here will never be opened again; prune lines whose target is gone.',
    '',
    '## Commands',
    '- Exact developer commands: install, build, test, lint, typecheck, format, codegen, run, deploy. Include command order when it matters.',
    '',
    '## Architecture',
    '- Real source layout, core modules, data flow, and anything non-obvious that an agent would likely get wrong.',
    '',
    '## Conventions',
    '- Repo-specific rules and "do not" rules with one-line reasons.',
    '',
    '## Pitfalls',
    '- Things that commonly break or waste time: generated code, required services, snapshots, flaky tests, env quirks, migrations.',
    '',
    '## Maintenance',
    '- Future agents: distill new discoveries into generalizable lessons (the command, convention, or pitfall worth remembering) and update the matching section in place; do not add task-specific details or work logs. New long-lived documents (spec, runbook, debug map, playbook) go where the Layout tree says they belong, open with a self-describing header, and get a trigger line in the Docs routing table in the same edit. Keep entries ordered (most-used first) and the file accurate and concise; prune entries that have decayed into one-off task detail or gone stale — the file must never only ever grow.',
    '```',
    '',
    'The skeleton is a floor, not a ceiling: add sections when the repo has knowledge that deserves its own reading moment — a step-by-step playbook for a recurring task, taste/style rules written as decision tests, a rejected-ideas list that keeps killed proposals from being re-proposed, user-locked decisions that must not be re-litigated. Order sections by how often an agent needs them.',
    '',
    'Reconstruct recent history before writing: think back over this session — what was done, what the user corrected or decided, what broke and why. Your memory of the session may have been compacted or truncated, so verify against evidence outside your own context: recent git history, uncommitted changes, files created or touched this session, handover or audit docs. Anything from that reconstruction that passes the distill filter (a different future task would need it) belongs in this file as much as static repo facts — freshly learned lessons are the highest-signal content AGENTS.md can carry.',
    '',
    'Inspect the repository yourself with your file/read/search tools. At minimum look at:',
    '- README*, root manifests, workspace config, lockfiles',
    '- build / test / lint / typecheck / formatter / codegen configuration',
    '- CI workflows, pre-commit or task-runner config',
    '- existing instruction files: AGENTS.md, CLAUDE.md, .cursor/rules/, .cursorrules, .github/copilot-instructions.md, opencode.json',
    '- recent git history and working-tree state (git log, git status, git diff): what actually happened recently — this evidence survives context compaction even when your own memory of the session does not',
    '- the docs/ directory: whatever long-lived documents the repo actually keeps (specs, runbooks, debug maps, playbooks, audits — judge by what is really there, not by a fixed list) and which of them deserve a trigger line in the Docs routing table',
    '- source layout: real entrypoints, package boundaries, and the directories that contain core logic',
    '',
    'Extract the highest-signal, repo-specific facts and summarize them into the skeleton above:',
    '- exact developer commands, especially non-obvious ones, and command order when it matters (e.g. lint -> typecheck -> test)',
    '- how to run a single test, a single package, or a focused verification step',
    '- monorepo / multi-package boundaries, ownership of major directories, real app/library entrypoints',
    '- framework or toolchain quirks: generated code, migrations, codegen, build artifacts, special env loading, dev servers, deploy flow',
    '- repo-specific conventions that differ from framework defaults, and "do not" rules with one-line reasons',
    '- testing quirks: fixtures, integration prerequisites, snapshot workflows, required services, flaky/expensive suites',
    '- important constraints worth preserving from existing instruction files',
    '',
    'For each section, fill in only verified, repo-specific facts. Omit any section that has no verifiable content instead of leaving placeholder text or inventing details.',
    '',
    DISTILL_RULE + ' Phrase rules as executable decision tests an agent can follow, not adjectives (bad: "keep tests stable"; good: "after changing X you must run Y, or snapshots drift — CI job #123"). One fact, one home: write the full detail in the most specific section and point to it elsewhere instead of restating. Within each section, order entries deliberately — most-used or most-critical first — and keep that order stable across future updates so the file stays an ordered checklist, not an accretion pile.',
    '',
    'Exclude: generic software advice, long tutorials, bare file-tree dumps (a tree without one-line annotations per entry is noise — an annotated map is required, see the Layout section), obvious language conventions, speculative claims, one-off task details (feature-specific values, incident write-ups, work logs), or anything you could not verify.',
    '',
    lengthGoal,
    '',
    'If the repository is empty or lacks discoverable information, say so honestly instead of inventing it. If a few important facts are not discoverable from the code, ask the user targeted questions before writing.',
    '',
    'When updating an existing AGENTS.md, preserve anything still accurate and improve the weak/outdated parts. When force mode is set, you may start fresh.',
    '',
    'Report concisely what you created/updated and why.',
  ]
  return lines.join('\n')
}

// Producer identity for the injected context message. A source kind that is not
// `user` is what keeps the /init order out of the human turn: the client renders
// it as a collapsed context row (turn trigger when it wakes the driver) instead
// of a prompt the user appears to have typed.
export const SOURCE_KIND = 'want-a-init'

const INIT_SUMMARY = '/init: analyzing the project to create or update AGENTS.md'

/**
 * Deliver the analysis order as injected context.
 *
 * `agent.send(message, 'next-step', true)` routes the item to the next-step
 * inbox and wakes the driver, so the model runs on it without a human turn
 * owning the prompt. `agent.inject()` would not wake an idle driver, and
 * `agent.followup()` would open a turn presented as a user message. The
 * followup fallback covers runtimes that predate `send`.
 */
function deliver(agent, message) {
  if (typeof agent.send === 'function') agent.send(message, 'next-step', true)
  else agent.followup(message)
}

/**
 * Resolve the session's live working directory.
 *
 * `session.header.cwd` is only the creation-time directory; a session may have
 * changed it since (`working-directory/change`), so prefer the owning service
 * and fall back to the header when it is not composed.
 */
async function resolveWorkingDirectory(ctx, agent, signal) {
  const service = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
  if (typeof service?.ensure !== 'function') return agent.session.header.cwd
  try {
    return await service.ensure(agent, signal)
  } catch (error) {
    if (signal?.aborted) throw error
    ctx.logger?.warn?.('want-a-init: working directory lookup failed: %o', error)
    return agent.session.header.cwd
  }
}

export function apply(ctx, config = {}) {
  ctx.commands.register({
    name: 'init',
    description: 'Ask the agent to analyze the current project and generate/update AGENTS.md. Options: force, minimal, detailed.',
    input: { hint: 'optional: force | minimal | detailed, or free-form guidance' },
    async handler(invocation) {
      const { agent, signal } = invocation
      if (signal?.aborted) return { kind: 'error', text: 'Init cancelled.' }

      const cwd = await resolveWorkingDirectory(ctx, agent, signal)
      if (!cwd) {
        return { kind: 'error', text: 'No session working directory available.' }
      }

      const opts = parseOptions(invocation.rawInput)
      const prompt = buildPrompt(cwd, invocation.rawInput)

      deliver(agent, createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: SOURCE_KIND, form: 'notice', summary: INIT_SUMMARY },
      }))

      let text = 'Init started: I’m analyzing the project and will create/update AGENTS.md.'
      if (opts.conflict) text += ' Note: both minimal and detailed were given — proceeding with minimal.'
      if (opts.naturalLanguage) text += ' Your input will be interpreted as guidance for this run.'

      return { kind: 'success', text }
    },
  })

  // Persistent agent awareness: whenever the system prompt is assembled, remind
  // the agent that AGENTS.md is a living, repo-specific knowledge base it should
  // keep filling in and summarizing. This makes the maintenance behavior part of
  // the agent runtime, not just the one-shot /init command.
  // Gated by config.enabled (default true). Section order 50 sits between the
  // DEPLOYMENT_PERSONA_PREFIX (0) and PLAN_POLICY (500): after persona,
  // before first-party guidance.
  if (config.enabled === false) return
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'agents-md-maintenance',
      order: 50,
      text: 'AGENTS.md maintenance: treat the current workspace\'s AGENTS.md as a living, repo-specific knowledge base — an ordered checklist of generalizable lessons, not a task log. ' + DISTILL_RULE + ' Test before adding: would a different task in this repo need this again? If not, keep it out. Write-time discipline: write only at the end of a task, only when a genuinely reusable lesson emerged, and say in your reply which section you updated; skip entirely when nothing qualified — never edit the file mid-task or after every task. Maintenance runs both ways: prune entries that have decayed into one-off task detail — demote them to a one-line pointer or delete them; the file must never only ever grow. Keep entries in a stable, deliberate order (most-used first); one fact, one home — extend or point to the existing entry instead of restating it; update the matching section in place. Doc routing: when you create a long-lived document (spec, runbook, debug map, playbook, ADR — whatever this repo\'s own doc types are): place it where the repo\'s Layout tree says such files belong; open it with a self-describing header (what it is, when to read it — so a future session can tell its purpose even without the routing table); and add its trigger line — "<when to read it> -> <path> (<what question it answers>)" — to the Docs routing table in AGENTS.md in the same edit. Judge placement and routing by the repo\'s actual conventions, never by a fixed template. A document nothing points to will never be read again, and an agent that cannot tell what a file is for will stand helpless when a real problem hits. If you create a new location, update the Layout tree in the same edit. Prune routing lines whose target is gone. ' + ONLY_AGENTS_MD,
    })
  })
}
