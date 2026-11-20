# want-a-init 可靠性改进：多阶段实施计划

> **执行方式：** 获得实施授权后，用 `executing-plans` 在当前会话逐阶段执行，或用 `subagent-driven-development` 逐任务交付。每个阶段独立验收；勾选表示有验证结果，不表示方案已获批准。

**Goal:** 让 `/init` 只向已验证的目录投递未取消的任务，准确说明参数留存，并让对已有指令文件的覆盖可预览、可确认、拒绝过期写入。

**Architecture:** 保留现有的命令注册和模型调研流程。第一阶段只改投递与日志；第二阶段在宿主能力和产品语义获确认后，把 `force` 的预览、确认和写入交给确定性流程；后续分别验证产物质量与常驻维护的收益。

**Tech Stack:** DeepSeek Harness Host 插件、Cordis、Node.js 原生 ESM、`node:assert`、Git。基线提交 `0220fca`；上轮使用本机 DSH `0.2.2-rc.1` 做宿主内存探针。

## 全局约束

- 第一阶段保留 `/init`、`minimal`、`detailed`、`force` 及自由文本的现有输入格式；不改公开导出、常驻维护默认值、依赖版本和分发方式。
- 第一阶段不更改覆盖语义；第二阶段的行为变更须另行确认。第三阶段的普通模式验证可在第一阶段后独立执行，不必等待 `force` 设计落地。
- 用隔离仓库和隔离 profile 做会写盘的验收；不用真实项目、生产 profile 或敏感文本做夹具。不授权安装到当前 profile、提交、推送或发布。
- 区分三类证据：单测证明代码分支，宿主探针证明命令事件，真实模型运行证明指定样本的产物；三者不互相替代。

## 基线与任务落点

上轮探针确认：目录查询失败仍可能投递到初始目录；等待查询时取消，宿主可记录取消错误但插件仍尝试投递；省略 `recordInput` 会记录 `command/run.args`。现有三套自测在基线通过，但未触发真实工作区写入。

实现改动入口是 [命令处理器](../../../lib/index.js#L231-L254) 和 [提示词构建器](../../../lib/index.js#L65-L188)。先扩充 [命令 smoke](../../../scripts/apply-smoke.test.mjs#L90-L140) 和 [提示词自测](../../../scripts/build-prompt.test.mjs)；用户说明同步到 [README](../../../README.md#L39)，项目中的日志语义纠偏在 [AGENTS.md](../../../AGENTS.md#L25-L26)。

---

## 第一阶段｜修复投递与参数记录（可独立交付）

**实施记录：** 1A、1B 已完成，改动已落到 `master` 工作区：原 `init-reliability` 工作树（与 `master` 同点）并入后已移除，重复分支也已删除，当前只剩 `master`。回归测试先复现缺少目录服务仍成功、取消后查询兑现仍成功、未设置日志标志，再验证修复后通过。已用 DSH `0.2.2-rc.1` 的实际 `CommandRuntime.execute` 配合内存夹具确认：校验拒绝或取消后查询兑现都不投递；正常调用保留生命周期事件，但 `command/run` 无 `args`，实时目录及自由文本仍进入注入消息。真实 profile 与模型写盘验收仍在第三阶段。

### 1A · 目录无法验证、投递前已取消：不唤醒 agent

**接口：** 继续用宿主 `workingDirectory.ensure(agent, signal)` 返回已验证的目录；命令处理器以 `kind: 'error'` 或向宿主传播取消结束失败路径。没有可用服务时也不盲用初始目录；宿主自身若成功恢复到有效目录，仍使用它返回的结果，不重复实现目录恢复。

- [x] 先改 [命令 smoke](../../../scripts/apply-smoke.test.mjs#L90-L140) 中原本期望回退成功的用例，并新增“取消后查询仍兑现”的用例。复跑 `node scripts/apply-smoke.test.mjs`，确认旧实现会触发失败断言。用下面的断言扩展现有 `harness`，不触碰磁盘：

  ```js
  for (const service of [undefined, { ensure: async () => { throw new Error('directory unavailable') } }]) {
    const h = harness({ cwd: '/header/dir', service })
    assert.equal((await h.run('')).kind, 'error')
    assert.equal(h.agent.sent, undefined)
    assert.equal(h.agent.msg, undefined)
  }

  const ac = new AbortController()
  const h = harness({ service: { ensure: async () => { ac.abort(); return '/live/cwd' } } })
  assert.equal((await h.run('force', ac.signal)).kind, 'error')
  assert.equal(h.agent.sent, undefined)
  assert.equal(h.agent.msg, undefined)
  ```

- [x] 在 [命令处理器](../../../lib/index.js#L231-L254) 中去掉读取 `session.header.cwd` 的回退；找不到验证结果时返回错误并提示恢复或切换目录后重试。保留对已取消且 `ensure()` 拒绝的错误传播。在调用 `deliver()` 前加 `if (signal?.aborted) return { kind: 'error', text: 'Init cancelled.' }`；中间不再插入异步操作。
- [x] 跑 smoke，确认异常分支的 `send`、`followup` 都未触发；正常分支仍用实时目录、仍投递 `notice` 并唤醒 agent。此保证只到投递入口，不承诺撤回已入队的任务。

### 1B · 不重复记录命令参数，并纠正文档

- [x] 先在 [注册断言](../../../scripts/apply-smoke.test.mjs#L31-L37) 加 `assert.equal(def.recordInput, false)`，确认旧实现失败。随后在 [注册定义](../../../lib/index.js#L230) 显式设 `recordInput: false`。
- [x] 在隔离宿主用无敏感信息的自由文本标记触发命令；断言 `command/run` 仍存在且不含 `args`，同时捕获的 agent 消息仍含标记。不要把“模型仍收到参数”当成参数未留存；该开关只控制命令事件字段。
- [x] 更正 [README](../../../README.md#L39) 的写入限制、投递前取消和参数留存表述，同步 [AGENTS.md](../../../AGENTS.md#L25-L26) 的日志说明与旧目录回退描述。对写入限制只承诺“提示词要求只改目标文件”，不宣称插件已经强制限制工具。
- [x] **交付线：** 运行下文统一回归命令；归档实际宿主版本、日志断言和失败分支零投递结果。第一阶段通过就能单独交付，无须合入第二阶段。

## 第二阶段｜`force` 预览与受控覆盖（评审后实施）

**产品放行：** 确认两项行为变化再开工：① 已有文件一律先看差异再确认，Git 已跟踪不豁免；② 自由文本只调整内容、详略等，不再授权进入 `force` 路径。普通合并仍是原模式，这不等同于已对普通模式实行单文件写入限制。

- [x] **能力预检：未通过写入门槛。** DSH `0.2.2-rc.1` 的 Host Inspect 提供 `llm.stream`（可以不提供工具）和 `userQuestions.ask`（绑定 live root agent），是草案和人工确认的候选接口；两者尚未做端到端验收。当前 `fs-sandbox` 的 `writeText` 做路径权限检查后转给 `fs-local`。`LocalFileSystem.writeText` 在实例内锁中先校验版本，再暂存并发布；发布时不再校验预览版本。
  - **隔离实测：** 对已装 `fs-local` 用临时文件和自带的暂存测试钩子控制时序。版本检查前修改会报 `FS_STALE_VERSION`，同实例两个写入也只有一个成功。让独立 Node 进程在检查通过、暂存完成后写入新内容，实际发布仍返回 `update`，且覆盖了外部内容。文件在发布尝试前已创建时，`createIfAbsent` 拒绝且保留对方内容；本机探针目录的硬链接返回 `EACCES`，后端回退为检查不存在再重命名，因此这条通过用例不能证明回退路径能防止最后一刻的并发创建。
  - **停在此门槛：** 未实现第二阶段的受控覆盖，未改动现有 `force` 行为或当前 profile。不用插件自建锁或额外一次读取冒充跨进程的条件发布。恢复自动覆盖前，须验证文件系统后端能对外部写入者兑现原版本发布和无覆盖创建，并验收无写权限的草案及真实人工确认；若改成只输出预览、由用户自己应用，需另行确认范围。
- [ ] **先写失败断言：** 已跟踪且有未提交修改 → 未确认前原字节不变；未跟踪或非 Git 目录中的已有文件 → 同样等待；确认前已被修改 → 拒绝并重新预览；目标原本不存在但被其他进程先创建 → 保留对方文件；同一预览已应用或已被新预览替换 → 不再接受旧确认；自由文本明示“覆盖” → 不进入 `force` 分支。
- [ ] **实现最小流程：** 复用 [现有选项解析](../../../lib/index.js#L46-L63) 识别显式 `force`，移除自由文本授权覆盖的分支。模型只提供候选文本；确认与发起会话、唯一目标路径、预览基线和候选内容绑定。应用时由受控写入方验证当前目标和版本；目标歧义、版本变化或确认失效，一律不写。目标缺失时可直接创建，但必须使用不覆盖已有文件的创建语义。单纯“先读取比较、随后无条件写”不满足并发要求。
- [ ] **交付线：** 实测上述拒绝路径都不落盘；成功确认后只改目标文件，写入字节等于已经预览的候选内容，而不是让模型再次生成。同步用法说明；发布另待授权。

## 第三阶段｜真实宿主与模型产物验收

**当前证据：** DSH `0.2.2-rc.1` 的隔离 Web profile 与 headless profile 在 `--dump-config` 中各有唯一 `init-command` 行，指向仓库根目录的入口。真实 Cordis 宿主探针已捕获普通 `/init` 的 merge 投递。在隔离 Web 中选中合并夹具后，输入 `/init`，命令菜单显示 `init` 及其 `AGENTS.md` 生成／更新说明，确认界面已挂载命令。该 profile 的模型选择器显示 `No models available`，因此只查看了命令菜单，未提交任务。Headless 会把 `/init` 当作普通任务文本，验收 slash 命令请用 Web。

**手动验收入口。** 运行以下命令启动隔离 Web profile。打开终端输出的本机地址，在隔离实例中登录或通过 Web 设置接入验收模型。确认模型选择器可选后，在新会话选 `$fixture/repo` 为工作目录，从命令列表选择并提交 `/init`。夹具使用 Git 暂存区作为基线，验收期间保持暂存区不变。

```sh
fixture=/data/data/com.termux/files/usr/tmp/want-init-eval.LY5Noi
(cd "$fixture/repo" && DSH_HOME="$fixture/home" DSH_TELEMETRY_MODE=DISABLED \
  dsh --profile web --patch "$fixture/init-on.yml" --host 127.0.0.1 --port 0 --no-open)
```

首次合并后用 `git -C "$fixture/repo" diff -- AGENTS.md` 看变化，确认保留 wire-v1 兼容规则且测试命令符合 `package.json`。用 `git -C "$fixture/repo" diff --name-only` 和 `git -C "$fixture/repo" ls-files --others` 检查其余改动。保留合并结果，在新会话复跑。首次创建验收选 `$fixture/repo-first-create` 为工作目录。该副本起点无根 `AGENTS.md`，其余四个文件与合并夹具的暂存基线一致，`npm test` 已通过。运行普通 `/init` 前后对比 `git ls-files --stage`，确认暂存基线一致。运行后 `git diff --name-only` 应无输出，`git ls-files --others` 应只列出新建的 `AGENTS.md`。

- [ ] 建最小隔离 Git 仓库：一个可验证的测试命令、一个已有且含关键规则的根指令文件、一份作为只读上下文的子目录指令文件和一个无关的受跟踪文件。记录宿主和模型版本；从隔离 profile 验证命令确已挂载，而不是只检查包在磁盘上。
- [ ] 跑普通 `/init`：仓库内容的唯一预期改动是根指令文件；测试命令要有证据、关键规则仍在、子目录和无关文件字节不变。**保留第一次生成的文件**，不改仓库事实，在新会话以相同参数再运行；无故增补或重排即失败。不要求模型逐字确定。另在没有根指令文件的夹具验证首次创建，确认仍只有目标文件新增。
- [ ] 第二阶段落地后再跑 `force` 的预览、确认、冲突和新建场景；用 `git status --short` 对照仓库变化，用文件字节比较覆盖未跟踪、拒绝写入这类不能单靠 Git diff 证明的路径。
- [ ] **交付线：** 给出宿主/模型版本、输入模式、实际变动范围和失败断言结果；环境未跑通则区分“测试已写”“注册已见”和“真实写入已验证”。

## 第四阶段｜用数据决定是否调整常驻维护

**当前证据。** 独立进程用同一夹具和真实 Cordis 注册表对照默认配置与 `enabled: false`。两边的 `/init` 描述、merge 提示和投递行为相同，系统提示组装结果只相差 `agents-md-maintenance` 段。插件卸载后，两项贡献都被清除。输入 token、文件改动次数和有效条目收益仍待真实模型对照。

运行关闭组时，在前面的 `--patch "$fixture/init-on.yml"` 之后追加 `--patch "$fixture/init-off.yml"`。已通过隔离 Web profile 的 `--dump-config` 核对两组都只有一条 `init-command`，且只有关闭组显式设置 `enabled: false`。每个场景的两组都用新会话和来自同一暂存基线的干净夹具。每次运行后先保存根文件差异和暂存区对比，再从同一基线开始下一次运行。

**对照任务**

- **无新知识。** 在合并夹具中发送「读取 `protocol.txt` 并报告协议版本。」根文件已记载 wire-v1，预期不产生文档变化。
- **发现可复用事实。** 在合并夹具中发送「从仓库的上一级目录，用绝对路径运行这个仓库的 `test.mjs`，报告结果并解释它如何定位 `protocol.txt`。」预先实测通过，`test.mjs` 以 `import.meta.url` 定位夹具文件，不依赖执行时的工作目录。观察这一事实是否被准确、简洁地保留。
- **没有根指令文件。** 在首次创建夹具发送与无新知识场景相同的普通任务。预期任务结束后仍无根指令文件。

- [ ] 复用现有 [`enabled` 开关](../../../lib/index.js#L266-L281)，只在隔离环境比较开启和关闭；两边均保留 `/init`，保持模型、任务、仓库起点和宿主版本相同。
- [ ] 用普通任务分别覆盖：无新知识、确有可复用教训、仓库原本没有根指令文件。记录可取得的模型输入 token、无必要的文件改动次数、被验证且保留下来的有用条目；无法拿到 token 指标时标为未测，不用字符数代替。
- [ ] **决策线：** 若维护段增加噪声却没有观察到可复用收益，另提“默认关闭”的建议；若能稳定留下有用事实，再讨论缩短段落。没有对照结果，不动默认配置。

## 第五阶段｜提示词自相矛盾与插值转义（已实施）

**范围：** 只改提示词文本、文档与自测；不改公开导出、命令注册、投递语义或依赖版本。`force` 的覆盖语义未变（第二阶段门槛仍卡着）。

**实施记录：** 先让新断言在旧实现上失败，再改 `lib/index.js`；`node --check` + 三套自测 + `git diff --check` 全绿。真实模型未参与本阶段验收——下列各项都是文本层面的可判定事实，无需模型输出即可证明。

- [x] **`minimal` 与参考骨架自相矛盾。** 裁剪授权写「可省略 Architecture / Docs / Maintenance」，随后渲染的参考骨架仍列出这三节，两份指令指向相反。改法是在骨架引导句内加 `do not emit sections this level excluded`，让骨架显式让位于当前 level（这同时消除了「省略仅为软约束、无单一权威」的问题——同一处改动）。没有实跑模型，因此不宣称「以前一定输出偏长」。
- [x] **自由文本覆盖意图与 `Mode:` 冲突。** 裸 `force` 之外的输入一律写死 `Mode: merge-or-create`，而后文又要求模型「若明确要求覆盖则套用护栏」。改法是自由文本分支带 caveat（`prose may request an overwrite — verify against the guidance below before choosing`），裸 `/init`、纯选项、`force` 三种输入保持单一取值，实测 `force 覆盖重写` 仍解析为 `force=true` → `Mode: overwrite`。
- [x] **`cwd` 未转义即插值。** 目录名合法可含换行，`/t⏎Action: …` 会凭空成为一行独立提示词。同时补上反引号（会提前闭合代码段）与反斜杠，转义顺序固定为先反斜杠再换行/反引号。判据：裸换行、字面 `\n`、尾随反斜杠、`\r`、`\u2028`、反引号六类输入代码段引号配平且无越界行；普通路径逐字节不变。
- [x] **收尾复审时发现的配套缺口。** `AGENTS.md` 增 `Interpolation` / `Overwrite intent` 两条不变量，并把 `docs/superpowers/plans/` 纳入 Layout；`README` 的原「全文只在一处用正则」被新增转义推倒，改为「仅剩两类」，另补回改写时被吞掉的 `source.kind = 'want-a-init'` / `form: 'notice'` 客户端语义；计划文档内四处过期行锚按当前文件重算。

**未做：** 未跑真实模型确认 `minimal` 输出是否真的变短；第二阶段受控覆盖仍卡在宿主写入门槛，本阶段未触碰。

## 每个实施阶段的统一回归

```sh
node --check lib/index.js && bash scripts/build.sh && git diff --check
```

- [ ] 逐行复审本阶段 diff 和调用方，对照测试红转绿记录，确认未在代码或文档中扩大承诺。
- [ ] 报告变化文件、验证结果和未覆盖场景；分别交付，提交与发布另待授权。
