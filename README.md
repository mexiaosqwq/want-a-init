# want-a-init

Model-driven `/init` command for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH).

Instead of writing a hardcoded template, `/init` injects a focused prompt into the agent so the model itself analyzes the current project and writes/updates a high-signal `AGENTS.md`.

Only `AGENTS.md` is maintained. `CLAUDE.md` is intentionally **not** created.

## Features

- Scans the repository with the agent's own file/read/search tools
- Extracts exact commands, architecture, conventions, and project-specific pitfalls
- Excludes generic advice and unverifiable claims
- Merges/updates an existing `AGENTS.md` by default; `force` overwrites it
- Length modes:
  - `/init` — concise and practical (under ~200 lines)
  - `/init minimal` — very compact (~40 lines or fewer)
  - `/init detailed` — more thorough, but still no fluff

## Install

### From GitHub (after pushing)

```sh
dsh plugin --profile web add github:<owner>/want-a-init
```

Then restart DSH:

```sh
dsh web
```

### From a local path

```sh
dsh plugin --profile web add /data/data/com.termux/files/home/want-a-init
```

Then restart DSH:

```sh
dsh web
```

> If you previously added a manual `init-command` row to `profiles/web/cordis.patch.yml`, remove it before installing this bundle to avoid overriding the distributed plugin with the old local file.

## Usage

In a DSH session, from the project root:

```text
/init
/init force
/init minimal
/init detailed
```

The command returns immediately and the agent starts a follow-up turn to analyze the project and write `AGENTS.md`.

## Development

No build step is required: the plugin is plain ESM JavaScript and `lib/` is committed directly.

```sh
node --check lib/index.js
```

## License

MIT
