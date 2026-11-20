# want-a-init

## Project

- Host-only DeepSeek Harness plugin: `/init` asks the model to maintain the current directory's `AGENTS.md`; a separate system-prompt section guides ongoing maintenance. Plain ESM; `lib/` is checked in and needs no compilation.

## Layout

- `lib/index.js` — runtime entry: option parsing, prompt generation, command dispatch, and maintenance section.
- `lib/index.d.ts` — public declarations; keep runtime exports and signatures aligned. The build script checks file existence, not declaration parity.
- `cordis.patch.yml` — bundle row `init-command` registers plugin `want-a-init`; keep the row ID unique and the patch exported in `package.json`. Defaults belong in the Config schema, not the patch.
- `scripts/` — `build.sh` runs three assertion-based selftests; `package.json` and `pnpm-lock.yaml` define peer ranges and reproducible resolution. Keep `node_modules/` and `.codegraph/` untracked.
- `docs/superpowers/plans/` — the reliability plan records phase scope, what each phase actually verified, and the evidence type behind every claim. Update its implementation records when behavior changes; keep file/line anchors recomputed rather than copied.

## Commands

- Setup: `pnpm install --frozen-lockfile` from the repo root before running checks or loading a local link. Keep ranged peer declarations and update the lockfile alongside any range change.
- Full check after runtime changes: `node --check lib/index.js && bash scripts/build.sh`. The build script checks entry files and runs all selftests.
- Single checks: `node scripts/parse-options.test.mjs` (tokens and prose), `node scripts/build-prompt.test.mjs` (modes, guidance delimiter, and pause reasons), `node scripts/apply-smoke.test.mjs` (registration, delivery, directory validation, cancellation, and section gating).
- Web install: `dsh plugin --profile web add github:mexiaosqwq/want-a-init` or `dsh plugin --profile web add /path/to/want-a-init`; restart `dsh web` after installation or local plugin changes. Check for a shadowing row first (see Pitfalls).
- Verify the mount: look for `include:init-command` with `patchId: init-command` in Host Config Inspect and `/init` in the session command list. With maintenance enabled, check the system prompt for `agents-md-maintenance`. The smoke test imports real dependencies but stubs the host; verify actual delivery and file effects separately in a real DSH session.

## Architecture

- Dispatch: require a directory returned by `workingDirectory.ensure(agent, signal)`; never fall back to `session.header.cwd`. Recheck cancellation immediately before dispatch. `agent.send(message, 'next-step', true)` queues a `want-a-init` notice and wakes idle agents; use `followup` only when `send` is unavailable. `agent.inject()` alone does not wake the driver.
- Logging: keep `recordInput: false` to omit `command/run.args`. Guidance still reaches the model in the injected notice; this is not a general retention control.
- Parsing: only a list of bare `force`/`minimal`/`detailed` tokens sets flags. Empty input uses default merge mode, mixed prose goes to the model, and `minimal` wins conflicts with `detailed` with a command notice.
- Prompt: emit one `Detail level:` block; let `minimal` trim sections and let mixed prose guide brevity without changing the parsed detail level. Keep template rules outside the reference skeleton, and make the skeleton defer to the active level so its section list never contradicts a trimming license. Build pause reasons only for guards present in the branch and neutralize closing `user_guidance` tags inside free text.
- Interpolation: escape `cwd` before putting it in the template. It comes from the environment, so a directory name may legally contain a newline, backtick, or backslash; unescaped it injects prompt lines or closes the surrounding code span early. Escape backslashes before adding new ones, or the two collide.
- Overwrite intent: the `Mode:` field must state what the parsed input actually is. Bare `force` writes `overwrite`; free-form input carries the prose caveat rather than asserting a plain merge next to a guardrail paragraph that already assumes an overwrite may be requested.
- Write boundary: the command only prompts the agent; it does not write files. Update only the verified directory's `AGENTS.md` and treat other instruction files as read-only context. On overwrite (`force` or clear prose intent), the prompt requires a discard list before replacing an existing file: tracked files may be replaced in the same turn; untracked files (including outside Git) require confirmation. If the target is absent, explicit `force` proceeds with creation. These are prompt rules, not filesystem permissions.
- Maintenance section: default-on `agents-md-maintenance` is ordered at `650` between the host's `TEAM_POLICY` and `PTC_ONLY`. `enabled: false` suppresses only this section; ordinary tasks default to no edit and never create the file unasked.

## Conventions

- Edit `ONLY_AGENTS_MD` and `DISTILL_RULE` at their shared definition, and `FORCE_GUARDRAIL` once for both overwrite paths. Keep one-shot material out of the resident section. Preserve the open-ended ban on provenance tags, date stamps, and quote tails, the evidence requirement, and the exception for deployment safety, external contracts, and production boundaries.
- For behavior changes, first observe a failing assertion for the intended behavior, then run the full check. Add prompt assertions to `scripts/build-prompt.test.mjs` and host dispatch/section assertions to `scripts/apply-smoke.test.mjs`.

## Pitfalls

- `/init` missing with a local link: install the repo's dependencies first (`@deepseek-ai/dsh-llm` must resolve), then restart the host. A manual `init-command` row in `profiles/web/cordis.patch.yml` can shadow the bundle; remove the duplicate before installing.
- DSH compatibility checks include prereleases more broadly than pnpm's normal peer matching. A passing host check does not prove the peer range resolves; test the frozen install after changing it.
- On Termux, new-file `EACCES` from linking a staged file can indicate a missing host fs-local fallback. Check the host; if the fallback is missing, run `dsh-fix` and restart rather than changing plugin code or switching to shell writes.
- Read the target with the file tool before editing; DSH's observation policy can reject edits to unread files.

## Maintenance

- Update this file in place only for verified, reusable facts; keep each rule in one section. Preserve and flag deployment, external-contract, or production-boundary rules that need confirmation. Do not create another instruction file as a substitute.
