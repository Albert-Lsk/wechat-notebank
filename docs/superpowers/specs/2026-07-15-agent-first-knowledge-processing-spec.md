# wechat-notebank Agent 自助安装与知识加工闭环规格

> 状态：`ready-for-agent`
>
> 目标版本：`v0.2.0`
>
> 首发平台：macOS Apple Silicon
>
> 产品界面：Codex / Claude Code 等本地 Agent

## Problem Statement（问题陈述）

`wechat-notebank` 已能把微信公众号文章可靠保存为带 Frontmatter 的本地 Markdown，但用户仍需理解 Node.js、npm、CLI 和 skill 安装步骤，Agent 也缺少稳定、机器可读的安装诊断与执行接口。安装完成后，文章只进入 L1 原文层，用户还需要手工完成观点提炼、引用整理、阅读复盘、审核、落盘和双链维护。保存行为尚未形成“原文进入知识库，候选内容经用户审核后成为可复用知识资产”的闭环。

公共 skill 面向所有用户，不能把 ALSKai 的内容目标写死。不同用户可能为了个人学习、行业研究、内容创作或商业决策保存同一篇文章，因此加工视角必须由可选的自然语言 `processingGoal` 决定。没有目标时，系统应保持通用，不猜测用户职业、身份或意图。

## Solution（解决方案）

把 Agent 作为唯一操作界面，保持“CLI 负责可靠事实和文件事务，Agent 负责语义理解与用户对话”的边界。

首版增加四组能力：

1. 提供 `setup` 和 `doctor`，让具备终端权限的 Agent 能按 README 完成 skill 安装、更新、备份、诊断和验证。
2. 提供全局默认配置与项目覆盖配置，支持可选的 `processingGoal` 和默认关闭的 `autoProcess`。
3. 为关键 CLI 命令提供严格的 `--json` 契约，使 Agent 根据结构化结果继续工作，不解析人类日志。
4. 提供确定性的 `pack` 工作流：Agent 生成候选 Manifest，CLI 创建待审核加工包；用户在对话中审核后，CLI 发布 L2、L3、L4 并维护双链、状态、回滚和撤销。

用户日常流程为：粘贴公众号链接，CLI 保存 L1；若用户明确要求加工或 `autoProcess` 为真，Agent 根据实际生效的 `processingGoal` 生成候选 Manifest；CLI 创建待审核加工包；用户用自然语言选择候选项；CLI 发布正式知识资产并更新原文底部的衍生内容区域。

默认只保存原文。明确的“只保存”永远禁止加工；明确的“保存并加工”只对本次请求强制加工；没有明确说明时才读取 `autoProcess`。

## User Stories（用户故事）

1. 作为第一次使用的 macOS Apple Silicon 用户，我希望让 Agent 阅读仓库 README 并安装工具，以便不用自己理解每条终端命令。
2. 作为谨慎的用户，我希望 Agent 只使用固定 GitHub Release 标签安装，以便避免直接执行不断变化的 `main`。
3. 作为没有管理员权限的用户，我希望安装过程不使用 `sudo`，以便不修改系统级目录和权限。
4. 作为 Codex 用户，我希望 `setup` 安装或更新 Codex skill，以便重启后可以用自然语言触发归档。
5. 作为 Claude Code 用户，我希望 `setup` 安装 skill 和斜杠命令，以便获得一致的使用体验。
6. 作为已有旧 skill 的用户，我希望更新前自动备份，失败时恢复，以便安装不会破坏当前可用版本。
7. 作为排查环境问题的用户，我希望 `doctor` 只读检查平台、Node.js、npm、Chrome、CLI、skill 和配置，以便知道准确的阻塞原因。
8. 作为 Agent，我希望 `setup` 和 `doctor` 支持 JSON 输出，以便可靠判断每个检查项是否通过。
9. 作为用户，我希望 `setup --dry-run` 先展示会修改的内容，以便在写入前确认影响范围。
10. 作为普通用户，我希望设置一个全局默认知识库，以便从任何目录归档文章。
11. 作为项目用户，我希望项目配置覆盖全局默认配置，以便不同项目使用不同的归档位置和加工目标。
12. 作为已有用户，我希望旧 `.wechat-notebank.json` 继续生效，以便升级无需迁移现有知识库。
13. 作为内容创作者，我希望用自然语言设置 `processingGoal`，以便文章按我的内容目标加工。
14. 作为研究者，我希望同一篇文章可以按不同目标生成不同加工包，以便保留不同研究视角。
15. 作为只想备份的用户，我希望默认不触发 AI 加工，以便不产生额外文件和模型消耗。
16. 作为重度用户，我希望可以配置 `autoProcess`，以便粘贴链接后自动生成待审核加工包。
17. 作为 Agent，我希望 `fetch` 返回保存文件、来源 URL、归档根目录和生效配置，以便继续加工正确的文件。
18. 作为 Agent，我希望批量导入返回逐行的 saved、skipped 和 failed 结果，以便准确报告并只加工成功条目。
19. 作为用户，我希望单篇保存也按 `sourceUrl` 去重，以便不会因为重复请求生成多份原文。
20. 作为用户，我希望 L1 原文保持不变，以便加工流程不会改写来源内容。
21. 作为用户，我希望 Agent 先生成待审核加工包，以便低质量候选不会直接污染正式知识库。
22. 作为用户，我希望没有价值的 L2 或 L3 栏目可以为空，以便系统不为凑数量制造内容。
23. 作为用户，我希望直接引用必须在原文中精确存在，以便不会把 Agent 改写误当作者原话。
24. 作为用户，我希望 Agent 概括明确标记为观点提炼、案例、数据或转述，以便区分来源事实和机器加工。
25. 作为用户，我希望每条候选内容有稳定编号，以便在对话中说“保留 L2-01，删除 L3-02”。
26. 作为用户，我希望可以全部批准、部分批准或拒绝加工包，以便审核粒度符合实际需要。
27. 作为知识库用户，我希望每个 L2 原子观点生成独立卡片，以便以后单独引用和组合。
28. 作为知识库用户，我希望同一篇文章的 L3 引用、案例和数据合并为一个素材包，以便避免产生过多碎片文件。
29. 作为用户，我希望 L4 先提出复盘问题，以便最终复盘来自我的真实回答。
30. 作为用户，我希望 L4 同时保留我的原话和 Agent 整理稿，以便不会把整理后的表达误认为未经加工的本人原话。
31. 作为 Obsidian 用户，我希望原文、加工包、L2、L3、L4 之间都有 Wiki 双链，以便从任一资产追溯来源。
32. 作为用户，我希望原文底部集中展示全部衍生内容，以便快速了解一篇文章的加工状态。
33. 作为用户，我希望重复执行审批命令不会重复创建文件或链接，以便 Agent 重试是安全的。
34. 作为用户，我希望加工过程中任一步失败都完整回滚，以便知识库不会出现半套资产。
35. 作为用户，我希望重新按相同目标加工时保留旧 revision，以便新结果不会覆盖历史审核记录。
36. 作为用户，我希望安全撤销某些已发布候选，以便 CLI 同步删除未被修改的文件和双链。
37. 作为编辑过卡片的用户，我希望撤销操作拒绝删除已修改文件，以便不会丢失我的后续编辑。
38. 作为手工管理文件的用户，我希望 `doctor` 报告断链，以便知道哪些手工删除导致状态漂移。
39. 作为公共 skill 用户，我希望默认文案不出现 ALSKai 专属判断，以便它适用于学习、研究、创作和决策等不同目标。
40. 作为维护者，我希望现有命令、别名和人类可读输出保持兼容，以便 v0.2.0 不破坏已有工作流。

## Implementation Decisions（实施决策）

### 产品与发布边界

- Agent 是唯一产品界面；不开发独立 App 或本地网页后台。
- v0.2.0 的 `setup` 与 `doctor` 只支持 macOS Apple Silicon。
- 运行依赖 Node.js 20+、npm 和本机 Chrome。程序不自动安装这些依赖，只报告缺失项和解决建议。
- 安装源使用固定 GitHub Release 标签。首版不发布 npm registry，也不制作独立可执行程序。
- 不绕过 Gatekeeper，不修改 shell 配置，不使用 `sudo`，不打印凭证或敏感环境变量。
- `setup` 只安装 Agent 集成；`init` 单独负责知识库配置。

### Skill 结构

- 对外只保留一个 `alskai-notebank` 入口 skill。
- 入口只判断当前任务属于安装诊断、归档导入、内容加工还是审核发布，并按需加载对应参考文件。
- 安装诊断、归档、加工和审核规则分别存放，避免每次保存文章都加载全部上下文。
- Skill 不实现抓取、配置解析、Manifest 校验、事务或双链写入；这些确定性行为全部委托 CLI。
- Agent 只负责文章理解、候选内容生成、复盘提问、整理用户回答，以及把自然语言选择翻译成 CLI 参数。

### Setup 与 Doctor

- `setup` 接受明确的 Agent 目标列表；JSON 非交互模式不猜测目标 Agent。
- `setup` 支持预演、JSON 输出、重复执行、更新前备份和失败恢复。
- `setup` 安装当前包内附带的 skill 与 Claude Code 命令，不下载和执行额外远程脚本。
- `setup` 完成后调用同一诊断核心并提示重启 Agent；它不能自行刷新当前 Agent 会话。
- `doctor` 完全只读，检查平台架构、Node.js、npm、Chrome、CLI 版本、skill 版本一致性、配置有效性、归档目录可写性和已知断链。

### 配置模型

- 配置优先级固定为：当次命令或用户请求、项目配置、用户全局默认配置、引导初始化。
- 项目配置继续使用现有 `.wechat-notebank.json`；全局默认配置固定为 `~/.config/alskai-notebank/config.json`。
- `processingGoal` 是可选自然语言，不使用固定枚举。
- `autoProcess` 是可选布尔值，未配置时为 `false`。
- 项目配置存在但无法解析或字段无效时直接报错，不静默回退到全局配置，避免写入错误知识库。
- 旧配置字段继续兼容；已有文章不会被批量改写。

### CLI 与 JSON 契约

- `setup`、`doctor`、`init`、单篇保存、批量导入和全部 `pack` 操作支持 `--json`。
- 公开命令固定为：`setup --agents <codex|claude|codex,claude> [--dry-run] [--json]`、`doctor [--json]`、`init --scope <global|project> --archive-path <path> [--processing-goal <text>] [--auto-process|--no-auto-process] [--json]`、单篇 URL 或 `fetch` 加 `--json`、`import <workbook> --json`、`pack create --source <file> --manifest <file> --json`、`pack update <pack> --manifest <file> --json`、`pack approve <pack> --items <ids> --json`、`pack reject <pack> --json`、`pack revoke <pack> --items <ids> --json`。
- `init` 对选定 scope 执行幂等创建或更新；省略可选字段时保留已有值，新建配置时使用默认值。空字符串 `processingGoal` 表示清除目标并回到通用加工模式。
- JSON 模式下 stdout 只包含一个完整 JSON 文档；进度与诊断日志只写 stderr。
- 成功和正常跳过使用退出码 0；失败使用退出码 1，并返回稳定的机器错误码。
- 单篇保存成功结果至少包含动作、来源 URL、保存文件、归档根目录、生效的 `processingGoal` 和 `autoProcess`。
- 单篇重复保存返回 skipped、重复原因和已有文件路径。
- 批量导入返回逐行状态和失败原因；一行失败不阻断后续行。
- JSON 非交互模式中，所有必填参数必须显式提供，不能进入终端问答。
- 首版稳定错误码固定为 `ENV_UNSUPPORTED`、`NODE_VERSION_UNSUPPORTED`、`NPM_NOT_FOUND`、`CHROME_NOT_FOUND`、`CONFIG_INVALID`、`ARTICLE_UNAVAILABLE`、`ARTICLE_PARSE_FAILED`、`MANIFEST_INVALID`、`QUOTE_NOT_FOUND`、`PACK_ALREADY_EXISTS`、`DERIVED_FILE_MODIFIED` 和 `TRANSACTION_FAILED`。

### 知识库与加工策略

- L1 保存微信公众号原文；Inbox 保存待审核加工包；L2 保存独立原子卡片；L3 每篇来源保存一个引用素材包；L4 每篇来源保存一个阅读复盘。
- 明确的“只保存”覆盖所有自动配置；明确的“保存并加工”只对本次请求强制加工；否则读取 `autoProcess`。
- 加工包首先判断文章可能支持的通用用途，再按实际生效的 `processingGoal` 提炼内容。没有目标时不猜用户身份。
- L2 候选包含稳定 ID、标题、独立观点、原文依据、适用边界和潜在用途。
- L3 候选包含稳定 ID、素材类型、标题、内容和原文章节。直接引用必须在 L1 中精确命中；概括使用非 quote 类型。
- L4 初始 Manifest 只包含复盘问题。用户回答后，Agent 保留用户原话并生成明确标注的整理稿，再提交更新后的 Manifest。未包含用户回答的 L4 不得发布。
- L2 和 L3 可先发布，加工包保持 partial；L4 可以在之后完成。

### Manifest 与 Pack 状态

- Manifest v1 顶层字段固定为 `schemaVersion`、`sourceFile`、`sourceUrl`、`processingGoal`、`atomicNotes`、`materials` 和 `reviewQuestions`；用户回答后可增加 `reviewAnswers` 与 `reviewDraft`。`schemaVersion` 首版只接受数值 `1`。
- 每条 L2 候选包含 `id`、`title`、`claim`、`evidence`、`boundary` 和 `useCases`；ID 使用 `L2-` 加两位递增数字。
- 每条 L3 候选包含 `id`、`kind`、`title`、`content` 和 `sourceSection`；`kind` 只接受 `quote`、`paraphrase`、`case` 或 `data`，ID 使用 `L3-` 加两位递增数字。
- 每条 L4 问题包含 `id` 和 `question`，ID 使用 `L4-Q` 加两位递增数字。`reviewAnswers` 必须按问题 ID 保存用户原话，`reviewDraft` 必须显式标记为 Agent 整理稿。
- Agent 将临时 Manifest 交给 CLI；CLI 验证后，把规范化 JSON 存入知识库内的隐藏状态目录，并生成用户可见的 Markdown 加工包。
- 隐藏 JSON 是 pack 的机器真源；可见 Markdown 用于用户阅读，不作为事务解析来源。
- `packId` 使用来源 URL、换行符和去除首尾空白后的加工目标计算 SHA-256；没有目标时使用固定值 `__general__`。相同来源和目标默认复用已有 pack。
- 用户明确重新加工时创建新 revision，旧 revision 标记为 superseded，不覆盖历史。
- Pack 状态包括 pending、partial、approved、rejected、revoked 和 superseded。
- 公开操作包括创建、更新、部分或全部批准、拒绝和按候选撤销。

### 双链与事务

- 所有衍生文件同时保存机器可读的来源字段和指向 L1 的 Wiki 链接。
- 原文底部使用明确的起止标记维护“衍生内容”区域；CLI 只能修改标记之间的内容。
- 生成加工包后立即加入加工包链接；审批后只加入实际生成的 L2、L3、L4 链接。
- 所有候选、目标路径和引用先完成全量验证，再开始写入。
- 改动前记录原文、pack、隐藏状态和目标文件的事务备份；新文件先写临时文件，全部成功后再原子重命名并更新状态。
- 任一步失败时恢复事务前状态，不保留半套文件或双链。
- 发布时记录正式文件 SHA-256。撤销只删除仍与发布哈希一致的文件；文件被用户修改时拒绝自动删除。
- 手工删除导致的断链只由 `doctor` 报告，首版不自动修复。

### 兼容与升级

- 现有 `fetch`、直接 URL、`import`、`-o`、`--output`、`wechat-notebank` 兼容别名和人类输出继续工作。
- 单篇保存新增与批量导入一致的 sourceUrl 去重语义。
- 现有本地配置继续优先于全局默认配置。
- 已有 L1 文件在首次生成 pack 时才增加受管衍生内容区域。
- 旧单文件 skill 升级为入口加参考文件，但用户仍只安装和调用一个 skill。

## Testing Decisions（测试决策）

- 最高测试接缝是编译后的真实 CLI：在临时 HOME 和临时知识库中运行命令，断言退出码、stdout JSON、stderr、生成文件、状态和双链。测试外部行为，不依赖内部模块布局。
- 参数解析、配置优先级、Manifest schema、直接引用匹配、哈希、状态转换和事务故障注入使用纯逻辑单元测试。
- 沿用项目现有的 Node `assert` 测试风格和“先构建再运行测试文件”的执行方式；新增端到端测试也必须隔离真实 HOME、Agent 目录和知识库。
- Setup 测试覆盖预演无写入、目标 Agent 选择、首次安装、幂等更新、旧版备份和中途失败恢复。
- Doctor 测试覆盖每个检查项、只读保证、结构化警告和不支持平台结果。
- 配置测试覆盖全局默认、项目覆盖、当次参数优先、旧配置兼容、损坏项目配置禁止回退和默认 `autoProcess=false`。
- JSON 测试覆盖 stdout 纯净、stderr 日志、稳定错误码、成功/跳过/失败退出码以及批量逐行结果。
- Pack 测试覆盖空候选、ID 重复、quote 精确命中失败、相同目标去重、新 revision、部分审批、重复审批幂等、拒绝和撤销。
- L4 测试覆盖只有问题时禁止发布、用户原话保留、Agent 整理稿标记和 L2/L3 先发布后的 partial 状态。
- 双链测试覆盖初次插入、重复执行无重复、部分审批、撤销同步移除、标记外内容不变和旧文章首次加工。
- 事务测试在每个写入阶段注入失败，证明文件、状态和链接全部恢复。
- 撤销测试覆盖未修改文件可安全删除、已修改文件返回 `DERIVED_FILE_MODIFIED` 且内容不变。
- 端到端验收从安装后的 Agent 流程出发：诊断、初始化、保存、生成 pack、部分批准 L2/L3、录入用户回答、批准 L4、验证双链、重复执行、修改后拒绝撤销、模拟失败回滚。

完成标准：在 macOS Apple Silicon、Node.js 20+、npm 和 Chrome 已存在的环境中，用户只需让本地 Agent 阅读 README，即可完成 CLI/skill 安装验证；重启后粘贴文章链接，能按默认只保存或配置自动加工进入待审核队列，并通过自然语言审核安全生成可追溯的 L2、L3、L4。

## Out of Scope（非目标）

- macOS Intel、Windows 和 Linux 的 `setup` 或 `doctor` 支持。
- macOS 独立可执行程序、Developer ID 签名、公证、DMG 或 PKG。
- npm registry 发布和自动更新服务。
- 独立桌面 App、本地网页后台或移动端界面。
- 自动安装 Node.js、npm 或 Chrome。
- 额外模型 API、模型供应商配置或模型费用管理。
- 向量数据库、跨文章问答、全文搜索、自动标签和选题组装。
- 多用户、团队协作、云同步和订阅收费。
- 自动读取微信收藏夹、账号交互、失效文章恢复或绕过平台访问控制。
- 自动修复用户手工删除、重命名或移动造成的断链。
- 将 ALSKai 的身份、内容方向或判断标准写入公共 skill 默认逻辑。

## Further Notes（补充说明）

- ALSKai 是首个真实使用与验证配置，不是公共产品默认角色。
- 独立 macOS 程序将在具备 Apple Developer Program、Developer ID 和公证流程后另立规格。
- v0.2.0 应从固定 GitHub Release 标签安装，README 需提供适合 Agent 执行的标准安装提示词和人工安装步骤。
- 当前仓库没有配置独立 issue tracker；本文件作为 `ready-for-agent` 的规格真源。下一阶段应通过 `/to-tickets` 将本规格拆成带阻塞关系的 tracer-bullet tickets，再分别进入 `/implement`。
