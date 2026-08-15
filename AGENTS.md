# want-a-init

DSH plugin that provides a model-driven `/init` command: it analyzes the current project and generates/updates a high-signal `AGENTS.md`.

## Project

- Type: DeepSeek Harness host plugin — provides a slash command plus a persistent system-prompt maintenance section; no client/UI.
- Language: plain ESM JavaScript; no build step, `lib/` is committed directly.
- Entry: `lib/index.js` exports `name`, `inject`, and `apply`.
- Plugin identity: command registered as `init`; patch/loader id is `init-command` (bundle name `want-a-init`).
- Distribution: GitHub `mexiaosqwq/want-a-init`; also installable from a local path.

## Commands

- Local dependency setup: `pnpm install` in the repo (peer deps must be resolvable from the linked source; without this, `/init` will not appear and hot-install fails with `Cannot find package '@deepseek-ai/dsh-llm'`)
- Build/check: `bash scripts/build.sh` (no-op; verifies `lib/index.js` and `lib/index.d.ts` exist)
- Syntax check: `node --check lib/index.js`
- Install from GitHub: `dsh plugin --profile web add github:mexiaosqwq/want-a-init`
- Install locally: `dsh plugin --profile web add <path-to-repo>`
- Restart after install: `dsh web`
- Before installing the bundle, remove any manually added `init-command` row in `profiles/web/cordis.patch.yml` — it would override the distributed plugin.

## Architecture

- `lib/index.js` holds all runtime logic:
  - `buildPrompt(cwd, rawInput)` builds the `/init` prompt; `force` → overwrite, otherwise merge-or-create; `minimal`/`detailed` adjust length goal; includes a fill-in skeleton (`Project`, `Commands`, `Architecture`, `Conventions`, `Pitfalls`, `Maintenance`).
  - `apply(ctx)` registers the `/init` command via `ctx.commands.register`, then uses `ctx.inject(['systemPrompt'])` to add the persistent `agents-md-maintenance` section.
- Handler resolves `cwd` from `invocation.agent.session.header.cwd`; errors if absent.
- The command does NOT write `AGENTS.md` itself: it calls `invocation.agent.followup(createUserMessage(...))` so the model performs the analysis in the next turn, then returns an immediate success message.
- `lib/index.d.ts` mirrors the exports; `cordis.patch.yml` inserts the loader row; `scripts/build.sh` is a no-op check.
- No client bundle, no tests, no CI configuration.

## Conventions

- Only `AGENTS.md` is generated/updated by `/init`; never create `CLAUDE.md` or any other file.
- Keep the injected prompt high-signal: exact commands, real architecture, repo-specific pitfalls; no generic advice.
- Support `force`, `minimal`, and `detailed` modes.
- Bundle patch lives in `cordis.patch.yml`; keep its `id: init-command` unique to avoid duplicate loader entries.
- Keep `lib/index.d.ts` in sync with `lib/index.js` (`build.sh` checks both).
- Peer dependencies use range declarations (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-commands`, `@deepseek-ai/dsh-llm`); do not hardcode patch versions.

## Pitfalls

- Local `link:` installs fail without `pnpm install` in the repo: the plugin cannot resolve `@deepseek-ai/dsh-llm`, so `/init` never appears in the client.
- A manually added `init-command` row in `profiles/web/cordis.patch.yml` can shadow or override this bundle; remove it before installing.
- `buildPrompt` currently has no covering tests (CodeGraph flags no tests); be careful when changing prompt logic.
- `.codegraph/` is generated locally by CodeGraph and must stay gitignored; `pnpm-lock.yaml` is committed for reproducible local installs.

## Maintenance

- This file is a living form: whenever you discover a new repo-specific command, convention, architecture fact, or pitfall, update the matching section here in place.
- Keep it accurate and concise; remove stale or generic entries as the repository evolves.
- Never create `CLAUDE.md` as a substitute.
