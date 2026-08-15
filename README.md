# want-a-init

DeepSeek Harness 的模型驱动 `/init` 命令：让 agent 自己分析当前项目，生成/更新一份高信号、仓库特有的 `AGENTS.md`，并把“持续维护 AGENTS.md”写进 agent 运行逻辑。

[![Version: 0.1.0](https://img.shields.io/badge/version-0.1.0-5B4CF0?style=flat-square)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)
[![DSH: Web Profile](https://img.shields.io/badge/DSH-Web%20Profile-5B4CF0?style=flat-square)](cordis.patch.yml)

## 特性

- **模型驱动初始化**：不写死模板，`/init` 注入高信号 prompt，让 agent 分析仓库后生成/更新 `AGENTS.md`；
- **填写式归纳**：提供固定骨架（`Project` / `Commands` / `Architecture` / `Conventions` / `Pitfalls` / `Maintenance`），要求 agent 从仓库证据中逐项填写、归纳；没有可验证内容就写 `Not documented yet`；
- **模式**：`/init`（默认合并更新）、`/init force`（强制重写）、`/init minimal`（约 40 行内）、`/init detailed`（更详细但无废话）；
- **常驻 agent 意识**：通过 DSH `systemPrompt` 注入 `agents-md-maintenance` 段落，让每个 agent 会话都记得维护 `AGENTS.md`；
- **只维护 `AGENTS.md`**：刻意不创建 `CLAUDE.md`；
- **纯 host 插件**：无 client/UI、无构建步骤，`lib/` 直接提交。

## 安装

### 从 GitHub

```sh
dsh plugin --profile web add github:<owner>/want-a-init
```

### 从本地路径

```sh
dsh plugin --profile web add /path/to/want-a-init
```
