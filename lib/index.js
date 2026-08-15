/**
 * want-a-init — model-driven /init command for DeepSeek Harness.
 *
 * Injects a focused prompt into the agent so the model analyzes the project
 * and writes/updates a concise, high-signal AGENTS.md. Only AGENTS.md is
 * maintained; CLAUDE.md is intentionally not created.
 *
 * Options (in raw input):
 *   force    — overwrite AGENTS.md instead of merge/update
 *   minimal  — aim for a very compact AGENTS.md (~40 lines or fewer)
 *   detailed — allow a more thorough AGENTS.md (still no fluff)
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'init-command'
export const inject = ['commands']

function buildPrompt(cwd, rawInput) {
  const force = /\bforce\b/i.test(rawInput)
  const minimal = /\bminimal\b/i.test(rawInput)
  const detailed = /\bdetailed\b/i.test(rawInput)

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
      ? 'The user asked to force regenerate, so you may overwrite AGENTS.md.'
      : 'If AGENTS.md already exists, read it first and improve it in place rather than blindly replacing. Preserve verified useful guidance, delete stale or generic content, and reconcile it with the current codebase.',
    '',
    'Goal: create or improve `AGENTS.md` so future agent sessions in this repo can avoid mistakes and ramp up quickly. Only create/update `AGENTS.md`; do NOT create CLAUDE.md or any other file.',
    '',
    'Inspect the repository yourself with your file/read/search tools. At minimum look at:',
    '- README*, root manifests, workspace config, lockfiles',
    '- build / test / lint / typecheck / formatter / codegen configuration',
    '- CI workflows, pre-commit or task-runner config',
    '- existing instruction files: AGENTS.md, CLAUDE.md, .cursor/rules/, .cursorrules, .github/copilot-instructions.md, opencode.json',
    '- source layout: real entrypoints, package boundaries, and the directories that contain core logic',
    '',
    'Extract the highest-signal, repo-specific facts:',
    '- exact developer commands, especially non-obvious ones, and command order when it matters (e.g. lint -> typecheck -> test)',
    '- how to run a single test, a single package, or a focused verification step',
    '- monorepo / multi-package boundaries, ownership of major directories, real app/library entrypoints',
    '- framework or toolchain quirks: generated code, migrations, codegen, build artifacts, special env loading, dev servers, deploy flow',
    '- repo-specific conventions that differ from framework defaults, and "do not" rules with one-line reasons',
    '- testing quirks: fixtures, integration prerequisites, snapshot workflows, required services, flaky/expensive suites',
    '- important constraints worth preserving from existing instruction files',
    '',
    'Exclude: generic software advice, long tutorials, exhaustive file trees, obvious language conventions, speculative claims, or anything you could not verify.',
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

export function apply(ctx) {
  ctx.commands.register({
    name: 'init',
    description: 'Ask the agent to analyze the current project and generate/update AGENTS.md. Options: force, minimal, detailed.',
    input: { hint: 'optional: force | minimal | detailed' },
    handler(invocation) {
      const cwd = invocation.agent.session.header.cwd
      if (!cwd) {
        return { kind: 'error', text: 'No session working directory available.' }
      }

      const prompt = buildPrompt(cwd, invocation.rawInput)

      invocation.agent.followup(createUserMessage({
        content: [{ type: 'text', text: prompt }],
        source: { kind: 'user' },
      }))

      return {
        kind: 'success',
        text: 'Init started: I’m analyzing the project and will create/update AGENTS.md.',
      }
    },
  })
}
