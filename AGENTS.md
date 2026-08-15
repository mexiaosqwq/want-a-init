# want-a-init

DSH plugin that provides a model-driven `/init` command: it analyzes the current project and generates/updates a high-signal `AGENTS.md`.

## Project

- Type: DeepSeek Harness host plugin — provides a slash command plus a persistent system-prompt maintenance section; no client/UI.
- Language: plain ESM JavaScript; no build step, `lib/` is committed directly.
- Entry: `lib/index.js` exports `name`, `inject`, and `apply`.
- Plugin identity: command registered as `init`; patch/loader id is `init-command` (bundle name `want-a-init`).

## Runtime behavior

- `apply(ctx)` registers the slash command through `ctx.commands.register`.
- Handler resolves `cwd` from `invocation.agent.session.header.cwd`; errors if absent.
- `buildPrompt()` maps `force` → overwrite mode, otherwise merge-or-create; `minimal`/`detailed` adjust the length goal.
- The prompt gives the agent a fill-in skeleton (`Project`, `Commands`, `Architecture`, `Conventions`, `Pitfalls`, `Maintenance`) and tells it to fill each section from verified repository evidence, writing `Not documented yet` when a section has no discoverable content.
- It does NOT write `AGENTS.md` itself: it calls `invocation.agent.followup(createUserMessage(...))` so the model performs the analysis in the next turn, then returns an immediate success message.
- It also injects a persistent `agents-md-maintenance` system-prompt section via `ctx.inject(['systemPrompt'])`, so every agent session is reminded to keep `AGENTS.md` updated — not just when `/init` is run.

## Commands

- Local dependency setup: `pnpm install` in the repo (peer deps must be resolvable from the linked source; without this, `/init` will not appear and hot-install fails with `Cannot find package '@deepseek-ai/dsh-llm'`)
- Build/check: `bash scripts/build.sh` (no-op; verifies `lib/index.js` and `lib/index.d.ts` exist)
- Syntax check: `node --check lib/index.js`
- Install locally: `dsh plugin --profile web add <path-to-repo>`
- Install from GitHub: `dsh plugin --profile web add github:<owner>/want-a-init`
- Before installing the bundle, remove any manually added `init-command` row in `profiles/web/cordis.patch.yml` — it would override the distributed plugin.

## Conventions

- Only `AGENTS.md` is generated/updated by `/init`; never create `CLAUDE.md` or any other file.
- Keep the injected prompt high-signal: exact commands, real architecture, repo-specific pitfalls; no generic advice.
- Support `force`, `minimal`, and `detailed` modes.
- Bundle patch lives in `cordis.patch.yml`; keep its `id: init-command` unique to avoid duplicate loader entries.
- Keep `lib/index.d.ts` in sync with `lib/index.js` (`build.sh` checks both).

## Maintenance

- This file is a living form: whenever you discover a new repo-specific command, convention, architecture fact, or pitfall, update the matching section here in place.
- Keep it accurate and concise; remove stale or generic entries as the repository evolves.
- Never create `CLAUDE.md` as a substitute.
