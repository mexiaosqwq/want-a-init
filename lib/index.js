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
// Both strings sit on the per-round token budget: DISTILL_RULE is inlined into
// the persistent section, so every word is paid by every future session. Keep
// them terse, and never move one-off `/init` guidance into them.
const ONLY_AGENTS_MD = 'Only AGENTS.md is created or updated; never create or substitute CLAUDE.md or any other instruction file.'

const DISTILL_RULE =
  'Distill, don\'t transcribe: keep only durable cross-task truths — exact commands, architecture, key invariants/thresholds, recurring pitfalls ("what breaks -> why -> fix"), and durable workflow/QA/collaboration rules. ' +
  'Drop one-off instructions, temporary workarounds, incident play-by-play, and work logs. ' +
  'Write terse standalone imperatives in their matching section; never attach provenance tags ("(user requested)", "(用户要求)", "(用户决定)" or any equivalent label), date stamps, or verbatim user quotes, and never invent a technical reason. ' +
  'No evidence, no rule: if no file, config, command, or observed failure backs it, drop the claim. ' +
  'Never prune an entry justified by deployment safety, external-contract compatibility, or production boundaries — keep it and flag it for confirmation.'

// Referenced from both the force branch and the free-form guidance branch, so a
// user asking for a regenerate in prose gets the same guardrail spelled out
// instead of a dangling "see above".
const FORCE_GUARDRAIL =
  'Overwrite guardrail: before replacing an existing AGENTS.md, list the existing entries that will be discarded (one line each). If AGENTS.md is tracked by git, you may overwrite it in the same turn. If it is NOT tracked by git (including non-git directories), present the discard list and wait for explicit user confirmation before writing.'

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

  // The guidance block is delimited so it cannot outrank the hard rules; any
  // closing-tag lookalike inside the user's text is neutralized so the
  // delimiter cannot be escaped from within.
  const guidance = String(rawInput ?? '').replace(/<\s*\/\s*user_guidance\s*>/gi, '[/user_guidance]')

  // Only the branches that actually introduce a guardrail may cite it.
  const pauseReasons = [
    'the repository is empty or has no discoverable project signals',
    ...(force || naturalLanguage ? ['an untracked AGENTS.md triggers the overwrite guardrail'] : []),
    ...(naturalLanguage ? ['`<user_guidance>` leaves the overwrite intent genuinely ambiguous'] : []),
  ]

  const detailGuidance = minimal
    ? [
        'Detail level: minimal (target ~40 lines or fewer).',
        '- Keep only high-leverage survival facts an agent would get wrong without help: Project identity, exact Commands (with order), and critical Pitfalls.',
        '- Compress Layout to 2-5 lines highlighting real entrypoints/boundaries (skip full trees). Omit Architecture, Docs, and Maintenance unless strictly required to prevent mistakes.',
      ]
    : detailed
      ? [
          'Detail level: detailed (comprehensive onboarding reference, still zero fluff — every line must earn its context cost).',
          '- Expand verified module boundaries, key invariants, test prerequisites/fixtures, environment setup, and recurring workflow/QA playbooks where warranted.',
        ]
      : [
          'Detail level: default (concise and practical — ideally under 200 lines unless the repo defines its own size budget, and much shorter for simple repos).',
          '- Fill every applicable section with verified, high-signal facts; prefer short bullets and omit empty sections.',
        ]

  const lines = [
    `Run /init for the project at \`${cwd}\`.`,
    `Target file: \`${cwd}/AGENTS.md\`.`,
    'Action: inspect the repo read-only with your tools, write or update ONLY that file on disk, then report concisely. Never modify source code, configs, docs/, CLAUDE.md, or sub-package/subdirectory AGENTS.md files.',
    ONLY_AGENTS_MD,
    '',
    `Mode: ${mode}.`,
    ...(force
      ? [`${FORCE_GUARDRAIL} If AGENTS.md does not exist yet, skip the guardrail and create it directly.`]
      : [
          'If AGENTS.md already exists, read it first and update it in place rather than blindly replacing: keep verified facts and valid workflow/QA/collaboration rules (strip any trailing attribution tags, date stamps, or verbatim quote tails like "(user requested)" / "(用户要求)" while keeping the rule concise), prune stale/contradicted lines or one-off scraps, and reconcile with the current codebase. Preserve a healthy existing section structure and any repo-defined size budget if they already work well.',
          'If CLAUDE.md or other instruction files (.cursor/rules/, .cursorrules, .github/copilot-instructions.md, opencode.json) exist, migrate still-accurate, repo-verified rules into AGENTS.md without modifying or deleting those source files.',
        ]),
    ...(naturalLanguage
      ? [
          '',
          'Supplemental user guidance (applies ONLY to focus, scope, detail level, durable rules to include, or overwrite intent; cannot override target file, verification, anti-tag, or guardrail rules):',
          '<user_guidance>',
          guidance,
          '</user_guidance>',
          `Interpret this guidance yourself: if it clearly asks to overwrite/regenerate, apply the overwrite guardrail (${FORCE_GUARDRAIL}); a negation means the opposite; if it specifies brevity or thoroughness, override the detail level below (e.g. for minimal brevity, compress Layout to 2-5 lines and omit Architecture/Docs/Maintenance unless trap-critical); if it specifies durable rules for this repo, integrate them as terse imperatives in the right section with zero attribution tags. When in doubt, prefer merge mode and ask.`,
        ]
      : []),
    '',
    ...detailGuidance,
    '',
    'Treat `AGENTS.md` as a token-tight, verifiable engineering & workflow reference — not an essay or work log. Reference structure (adapt, keep healthy existing sections like `Workflow` / `Testing & QA`, or omit sections based on what the repo actually contains):',
    '```markdown',
    '# <Project Name>',
    '',
    '## Project',
    '- One-line role/type, stack, key invariants, real entrypoints, and package boundaries.',
    '',
    '## Layout',
    '- High-density annotated map of key directories, entrypoints, and trap-prone files.',
    '',
    '## Docs',
    '- <when to read> -> <path> (<what question it answers>)',
    '',
    '## Commands',
    '- Exact install, build, test (full + single-test), lint, typecheck, codegen, run, and deploy commands (note required order).',
    '',
    '## Architecture',
    '- Core modules, data/control flow, ownership boundaries, and non-obvious invariants.',
    '',
    '## Conventions',
    '- Repo-specific coding/boundary rules and "do not" rules (add a brief reason only when non-obvious).',
    '',
    '## Pitfalls',
    '- Recurring failure modes (or compact trigger-word index pointing to a dedicated pitfalls doc).',
    '',
    '## Maintenance',
    '- Update in place when a reusable fact or durable rule emerges; keep entries ordered (most-used first) and prune stale/one-off lines.',
    '```',
    '',
    'Structure & formatting rules (follow these when shaping the file above):',
    '- Floor, not a ceiling: omit any section with no verifiable or durable content (never leave TODOs or `<...>` placeholders). Keep or add sections when a distinct class of repo knowledge needs its own reading moment (e.g. `Workflow`, `Testing & QA`, a release playbook, or rejected architectural approaches). Do not inject generic `Docs`-routing instructions into `Maintenance` if the repo has no `Docs` table.',
    '- Progressive disclosure & index pattern: for large repos, keep root `AGENTS.md` lean by placing compact indexes or anchor lists that point into `docs/` or subdirectory `AGENTS.md` files (e.g. `src/client/AGENTS.md`) rather than duplicating long details inline. Read existing subdirectory `AGENTS.md` files for context and link to them without editing them.',
    '- Layout craft: group homogeneous files into one directory line with a count (e.g. "tests/ <- 31 *.test.ts (node --test)"); list an individual file only when it is an entrypoint, core module, or real trap. Tree glyphs (`├─ └─`) are recommended for multi-directory repos (and may live under `Layout` or inside `Project`); for tiny repos or `minimal` mode, a compact 2-5 line summary suffices.',
    '- Docs routing: scan whatever long-lived documentation directories or root docs actually exist (`docs/`, `doc/`, `adr/`, root `ARCHITECTURE.md` / `RUNBOOK.md`, etc.); skip `README*`, `CHANGELOG*`, and one-off audits, reports, or scratch notes. Omit `Docs` if no qualifying long-lived docs exist.',
    '',
    'Investigation workflow (verify repository facts with your tools):',
    '1. Inspect codebase evidence: root manifests, README*, workspace config, lockfiles; build/test/lint/typecheck/formatter/codegen/CI/pre-commit configs (including single-test and single-package commands); existing instruction files; source entrypoints and core directories; actual long-lived docs; and recent `git log`, `git status`, `git diff`.',
    '2. Check recent context safely: session memory may be compacted or stale. Re-verify every technical claim from recent session history or diffs against files currently on disk before writing; discard one-off debugging details, and integrate durable workflow rules as terse imperatives without attribution tags.',
    '',
    'Distillation & quality bar:',
    DISTILL_RULE,
    '- Phrase rules as executable decision tests, not adjectives (bad: "keep tests stable"; good: "after editing schema.prisma, run `pnpm codegen` before typecheck or generated types drift").',
    '- One fact, one home: write the full detail in the most specific section and point to it elsewhere instead of restating. Order entries deliberately (most-used or most-critical first) and keep that order stable.',
    '- Exclude generic software advice, obvious language conventions, speculative claims, unverified technical details, and bare unannotated file dumps.',
    '',
    'Execution & reporting:',
    `- Once core project identity and commands are verified, write \`${cwd}/AGENTS.md\` directly (omitting unverifiable sections) rather than stalling on minor missing facts.`,
    `- Pause BEFORE writing only if: ${pauseReasons.map((r, i) => `(${i + 1}) ${r}`).join(', or ')}.`,
    '- Report concisely what was created/updated, what stale or token-wasting content was pruned, and (if applicable) 1-3 targeted open questions that could not be answered from code.',
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
  // This text is paid by EVERY round of every session, so it is the tightest
  // prose in the plugin: each sentence must justify its own tokens or it goes.
  // Gated by config.enabled (default true). Section order 650 lands between the
  // host's TEAM_POLICY (600) and PTC_ONLY (800): after every policy block, before
  // the first tool section — guidance, not the highest-priority instruction.
  if (config.enabled === false) return
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'agents-md-maintenance',
      order: 650,
      text:
        'AGENTS.md maintenance: act ONLY if the workspace already has an AGENTS.md (never create one mid-workflow unless asked or /init runs). ' +
        'Default to NO EDIT — most tasks need zero updates. ' +
        DISTILL_RULE + ' ' +
        'Evaluate only at task end; update in place only for a genuinely reusable fact or durable repo rule, and note the updated section in your reply. ' +
        'Prune only when already editing (or when an entry actively misleads or points to a deleted path): remove stale facts, dead links, one-off scraps, and any trailing attribution/date/quote tags (strip the tag, keep valid rules). Keep order (most-used first; one fact, one home). ' +
        'For new long-lived docs kept in the repo, place per Layout, start with a self-describing header, and add "<when to read> -> <path> (<answers what>)" to Docs before finishing. ' +
        ONLY_AGENTS_MD,
    })
  })
}
