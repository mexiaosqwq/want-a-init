# want-a-init

DSH plugin that provides a model-driven `/init` command: it analyzes the current project and generates/updates a high-signal `AGENTS.md`.

## Project

- Type: DeepSeek Harness host plugin — provides a slash command plus a persistent system-prompt maintenance section; no client/UI.
- Language: plain ESM JavaScript; no build step, `lib/` is committed directly.
- Entry: `lib/index.js` exports `name`, `inject`, `Config`, `SOURCE_KIND`, `parseOptions`, `buildPrompt`, `apply` — `lib/index.d.ts` must mirror all seven (checked by diffing against `Object.keys(import('./lib/index.js'))`).
- Plugin identity: command registered as `init`; patch/loader id is `init-command` (bundle name `want-a-init`).
- Distribution: GitHub `mexiaosqwq/want-a-init`; also installable from a local path.

## Layout

```text
want-a-init/
├─ lib/index.js                    ← 全部运行时逻辑：ONLY_AGENTS_MD / DISTILL_RULE / FORCE_GUARDRAIL 共享常量 · parseOptions · buildPrompt · SOURCE_KIND / deliver / resolveWorkingDirectory · apply（唯一该手改的源码）
├─ lib/index.d.ts                  ← lib/index.js 的类型镜像（build.sh 校验两者同步存在）
├─ scripts/                        ← 4 个脚本：build.sh（存在性校验 + 跑全部自测）· parse-options.test.mjs · build-prompt.test.mjs · apply-smoke.test.mjs
├─ cordis.patch.yml                ← loader row，id: init-command（勿手动加进 profiles，见 Pitfalls）
├─ package.json + pnpm-lock.yaml   ← peer deps 用 range 声明；lockfile 入库保可复现安装
├─ README.md / LICENSE / AGENTS.md / .gitignore ← 文档与元数据
└─ node_modules/ · .codegraph/     ← 本地生成，不入库
```

## Commands

- Verification chain (run ALL after any change to `lib/index.js`): `node --check lib/index.js` → `node scripts/parse-options.test.mjs` → `node scripts/build-prompt.test.mjs` → `node scripts/apply-smoke.test.mjs` (or just `bash scripts/build.sh`, which runs all three selftests) — 全绿才算验证过
- Local dependency setup: `pnpm install` in the repo (peer deps must be resolvable from the linked source; without this, `/init` will not appear and hot-install fails with `Cannot find package '@deepseek-ai/dsh-llm'`)
- Build/check: `bash scripts/build.sh` (existence check + runs all three selftests)
- Syntax check: `node --check lib/index.js`
- Option-parsing selftest: `node scripts/parse-options.test.mjs` (assert script for `parseOptions`)
- Prompt selftest: `node scripts/build-prompt.test.mjs` (five-mode assertions for `buildPrompt`: merge / force / free-form / minimal / detailed, plus the `<user_guidance>` escape guard and per-branch pause reasons)
- Apply smoke: `node scripts/apply-smoke.test.mjs` (real 0.2.2-line subpackage import chain: register → handler → `agent.send` injected `notice` context → section registration → `enabled=false` gate, plus cwd fallback / cancellation / no-`send` fallback paths)
- Install from GitHub: `dsh plugin --profile web add github:mexiaosqwq/want-a-init`
- Install locally: `dsh plugin --profile web add <path-to-repo>`
- Restart after install: `dsh web`
- Verify the bundle is actually mounted (not just installed): the host `Config` inspect provider should list `include:init-command` with `patchId: init-command` and `status: schema`; a session system prompt should contain the `agents-md-maintenance` section. Presence in `profiles/web/package.json` alone proves nothing.
- Before installing the bundle, remove any manually added `init-command` row in `profiles/web/cordis.patch.yml` — it would override the distributed plugin.

## Architecture

- `lib/index.js` holds all runtime logic:
  - Modes now differ by more than one sentence: `minimal`/`detailed`/default each swap in a whole `Detail level: ...` guidance block (3 / 2 / 2 lines), and `minimal` genuinely licenses section trimming (compress Layout to 2-5 lines; omit Architecture/Docs/Maintenance) so its ~40-line target is physically reachable. `force` is the only mode that swaps the merge branch for the discard guardrail. `buildPrompt` uses a regex in exactly one place — the `</user_guidance>` neutralizer below; a prose mention of "minimal" is NOT promoted into the minimal block. Instead the guidance-interpretation sentence carries the trimming permission inline ("e.g. for minimal brevity, compress Layout to 2-5 lines and omit Architecture/Docs/Maintenance"), so a mixed input like `/init minimal，重点写测试` still gets the compact shape by model judgment while the emitted `Detail level:` block stays honest about what was actually parsed. `parseOptions` stays regex-free. A new mode needs its own `Detail level` assertion in `scripts/build-prompt.test.mjs`.
  - The command definition sets no `recordInput`, so `/init` arguments stay out of the session log by default; set it only if the input must be replayable.
  - `buildPrompt(cwd, rawInput)` (exported, tested by `scripts/build-prompt.test.mjs` across merge/force/free-form/minimal/detailed) builds the `/init` prompt: it pins `Target file: <cwd>/AGENTS.md`, states the read-only investigation scope, always emits exactly one `Detail level:` block, and carries a fill-in reference skeleton (`Project`, `Layout`, `Docs`, `Commands`, `Architecture`, `Conventions`, `Pitfalls`, `Maintenance`) whose *rules live outside the code block* so trimming guidance can change per mode. Recent session history and git diffs are explicitly demoted to a low-trust candidate pool: re-verify against files on disk, strip task-specific details, admit only durable repo-wide facts. It enforces a two-sided distill filter, executable decision tests, one-fact-one-home pointers, most-used-first ordering, an annotated Layout map (same-pattern files merge into one counted directory line; only entrypoint/core/trap files get their own line), a trigger-based Docs routing table, reading-moment section extensions, and reverse-pruning. Force mode carries a shared `FORCE_GUARDRAIL` string: list discarded entries first; proceed same-turn only if git-tracked, otherwise wait for user confirmation; if the file does not exist yet, skip the guardrail and create it.
  - Prompt branches must not cite constructs they do not emit: `pauseReasons` is assembled conditionally (the untracked-AGENTS.md reason only for `force`/`naturalLanguage`, the `<user_guidance>` reason only for `naturalLanguage`), and `</user_guidance>` inside the user's own text is neutralized to `[/user_guidance]` so the delimiter cannot be escaped from within. Both are asserted in `scripts/build-prompt.test.mjs` — keep them when editing the prompt.
  - `parseOptions(rawInput)` (exported, tested by `scripts/parse-options.test.mjs`) parses options strictly: only when the input (ignoring whitespace/commas) is made of bare known tokens (`force|minimal|detailed`) are they applied — `minimal`+`detailed` sets `conflict` (handler surfaces it, minimal wins); non-empty anything-else is `naturalLanguage: true` and is passed verbatim to the model for interpretation (negations like 「别 force」 cannot misfire a regex); empty input is plain default mode (`naturalLanguage: false`).
  - Shared rule strings `ONLY_AGENTS_MD`, `DISTILL_RULE`, and `FORCE_GUARDRAIL` at the top of `lib/index.js` are the single source of truth for rules repeated across the command prompt and the persistent maintenance section — edit them there, never inline duplicate copies. `DISTILL_RULE` is *inlined into the per-round section*, so its wording is a permanent token tax on every session: keep it terse and never move one-off `/init` guidance into it. It carries the anti-provenance ban as an **open-ended family** (three named examples plus "or any equivalent label", plus date stamps and verbatim user quotes) rather than a fixed two-tag list — a closed list lets the model re-badge the same provenance as `(用户决定)` or a date stamp and pass. It also carries the two guardrails that would otherwise be duplicated in the maintenance section: `No evidence, no rule` (drop claims with no backing file/config/command/failure) and the prune carve-out for deployment-safety / external-contract / production-boundary entries. Asserted in the two selftests (tag aliases only in `scripts/build-prompt.test.mjs`).
  - `apply(ctx)` registers the `/init` command via `ctx.commands.register`, then — unless `config.enabled === false` — uses `ctx.inject(['systemPrompt'])` to add the persistent `agents-md-maintenance` section. Section `order: 650` lands between the host's `TEAM_POLICY` (600) and `PTC_ONLY` (800) in `dsh-system-prompt`'s `SECTION_ORDERS`: after every policy block, before the first tool section. It opens with a "never create one mid-workflow" valve plus `Default to NO EDIT`, so ordinary tasks do not treat the prompt as a standing invitation to edit the file. Everything else one-off (the reference skeleton, the `Detail level:` blocks, the scoped write-lock, the guardrail text) belongs to the `/init` prompt only — `scripts/apply-smoke.test.mjs` asserts the section does NOT contain `## Project` or `Detail level:`, so moving any of it into the section fails the suite.
  - `export const Config = z.object({ enabled: z.boolean().default(true) })` (schemastery peer) gates the persistent section only — the `/init` command stays available either way. Defaults live in the schema; `cordis.patch.yml` keeps `config: {}`.
  - The maintenance section is all-or-nothing (no per-project conditional injection); `config.enabled` is the only gate.
- Handler resolves `cwd` via `ctx.get('workingDirectory').ensure(agent, signal)` — the live directory, not just the creation-time `session.header.cwd` — falling back to the header when the service is absent or fails. Errors if neither yields a cwd; an already-aborted invocation delivers nothing.
- The command does NOT write `AGENTS.md` itself: `deliver()` calls `agent.send(createUserMessage(...), 'next-step', true)` with `source: { kind: SOURCE_KIND, form: 'notice', summary }` (falling back to `followup` on runtimes without `send`). The non-`user` source kind is what makes the order injected context — the client renders a collapsed context / turn-trigger row instead of a human chat bubble — while `wakeup: true` ensures an idle agent still runs it. `agent.inject()` alone would not wake an idle driver.
- `lib/index.d.ts` mirrors the exports; `cordis.patch.yml` inserts the loader row; `scripts/build.sh` existence-checks `lib/` and runs all three selftests.
- Peer ranges track the installed line: `@deepseek-ai/dsh-commands`/`dsh-llm` `^0.2.2-rc.1`, `cordis` `~4.1.0`, `schemastery` `^3.19.0`. Under plain semver a prerelease range admits prereleases of its own `major.minor` only (`^0.2.0-rc.2` covers `0.2.0-rc.2` alone — not `0.2.1-rc.5` or `0.2.2-rc.3`), while `^0.2.2-rc.1` covers 0.2.2-rc.x and every higher 0.2.x release. The host's `evaluatePluginCompatibility` passes `{ includePrerelease: true }`, so it accepts the wider set and will NOT catch this drift — only `pnpm install --frozen-lockfile` does, so run it after touching peer ranges. `exports` includes `"./cordis.patch.yml"` per the official bundle-package contract.
- No client bundle, no CI configuration (`scripts/parse-options.test.mjs` + `scripts/build-prompt.test.mjs` + `scripts/apply-smoke.test.mjs` are the only tests).

## Conventions

- Only `AGENTS.md` is generated/updated by `/init`; never create `CLAUDE.md` or any other file.
- Keep the injected prompt high-signal: exact commands, real architecture, repo-specific pitfalls; no generic advice.
- Support `force`, `minimal`, and `detailed` modes.
- Bundle patch lives in `cordis.patch.yml`; keep its `id: init-command` unique to avoid duplicate loader entries.
- Keep `lib/index.d.ts` in sync with `lib/index.js` (`build.sh` checks both).
- Peer dependencies use range declarations (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-commands`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/schemastery`); do not hardcode patch versions.

## Pitfalls

- If `write` fails creating a NEW file with `permission denied, link '<tmp>/*.tmp' -> '<target>'`, the fs-local fallback is missing — run `dsh-fix` and restart; do not fall back to bash heredoc as a habit. On a patched host the write path still attempts `link()` first, then catches the permission error and publishes the staged file by `rename()` after a no-replace guard (verified in `dsh-fs-local`: `linkFile` → `isPermissionError` → `publishTargetAbsent` → `rename`). Re-verified 2026-11-15: new files created successfully both in `~/tmp` and inside the repo working tree.
- `edit` requires reading the file first (DSH fs-observation-policy gate: `file has not been read` rejection) — always read before edit, even if content is fresh in context.
- Test assertions must follow intent, not implementation: the empty-input bug (`naturalLanguage: true` for `''`) shipped because its assertion copied the wrong behavior and stayed green. When prompt semantics change, update the assertion first, watch it go red, then fix the code.
- Local `link:` installs fail without `pnpm install` in the repo: the plugin cannot resolve `@deepseek-ai/dsh-llm`, so `/init` never appears in the client.
- A manually added `init-command` row in `profiles/web/cordis.patch.yml` can shadow or override this bundle; remove it before installing.
- `parseOptions` / `buildPrompt` / `apply` are covered by the three selftest scripts (run all before finishing any logic change); the real DSH end-to-end run after `dsh web` restart remains the only true validation of runtime behavior.
- `.codegraph/` is generated locally by CodeGraph and must stay gitignored; `pnpm-lock.yaml` is committed for reproducible local installs.

## Maintenance

- This file is a living form: whenever you discover a new repo-specific command, convention, architecture fact, or pitfall, update the matching section here in place.
- Keep it accurate and concise; remove stale or generic entries as the repository evolves.
- Never create `CLAUDE.md` as a substitute.
