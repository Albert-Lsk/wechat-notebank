# alskai-notebank JTBD、SEO 与 GEO 优化设计

## 目标

在不更改 `alskai-notebank` 名称、CLI 行为和现有命令的前提下，同时提升：

- Codex、Claude 对自然语言需求的识别与 skill 触发率；
- GitHub、搜索引擎和开发者搜索场景中的可发现性；
- 用户第一次看到项目时，对价值、适用场景和隐私边界的理解速度。

## 核心 JTBD

当用户在微信里遇到值得保留的内容，或微信收藏已经积累大量文章时，用户希望把这些文章从封闭、可能失效且不易检索的阅读环境迁移到自己的本地知识库，以便以后搜索、整理、引用和复盘。

### 用户处境

- 微信收藏和公众号链接不断积累，内容容易吃灰。
- 文章可能失效，之后难以找回。
- 用户已经使用 Obsidian、Logseq 或本地 Markdown 文件夹管理资料。

### 用户要完成的任务

- 保存、备份、归档、下载或导出单篇微信公众号文章。
- 把微信文章转换为 Markdown，迁移到本地知识库。
- 从 Excel 或 Numbers 批量导入公众号文章链接。

### 用户期望的进步

- 内容归自己掌控，保存在本机。
- 保留标题、作者、公众号、发布时间和原文链接等来源信息。
- 文章能够长期搜索、整理、引用与复盘。

## 定位边界

- 不把项目描述成全网公众号爬虫。
- 不承诺自动摘要、AI 标签或直接读取微信收藏夹。
- 不改变本地 CLI 作为唯一执行源的架构。
- 不改变现有命令、参数、安装路径或 skill 名称。
- 不上传、复制或暴露用户的知识库。

## GEO 设计

### Skill 触发语义

重写 `skills/alskai-notebank/SKILL.md` 的 description，使其覆盖用户可能使用的任务语言：

- save、archive、back up、download、export、migrate；
- 保存、备份、归档、下载、导出、迁移微信公众号文章；
- WeChat article to Markdown；
- Obsidian、Logseq、本地文件夹、个人知识库；
- Excel、Numbers 批量导入；
- 防止文章失效、丢失或无法检索。

Description 只描述触发条件，不概括执行流程，避免 Agent 跳过 SKILL.md 正文。

### Skill 正文

保持正文精简，增加从自然语言任务映射到 CLI 操作的规则。保留以下硬约束：

- CLI 是抓取、解析、去重和导入逻辑的唯一来源；
- CLI 成功退出后才能宣称成功；
- 批量导入需报告保存、跳过和失败结果；
- 不执行点赞、收藏、评论等微信账户交互；
- 不上传用户知识库。

### Codex 与 Claude 展示层

更新 `skills/alskai-notebank/agents/openai.yaml`：

- 展示名称：`ALSKai 公众号文章归档`
- 短描述：`把公众号文章保存为本地 Markdown，沉淀到 Obsidian 等个人知识库。`
- 增加与 skill 触发边界一致的默认提示词。

同步更新 `.claude/commands/alskai-notebank.md` 的用户价值说明，保持命令执行步骤不变。

## SEO 设计

### README

保留现有主体结构、安装说明、截图、故障排查和合规声明，只重构高影响区域：

- 首屏以“公众号文章转为本地 Markdown 知识资产”为核心价值；
- 增加一句英文摘要，覆盖英文 GitHub 搜索；
- 在首屏和适用场景中自然覆盖微信公众号文章保存、Markdown、Obsidian、Logseq、个人知识库、本地归档等语义；
- 在功能列表之前说明用户为什么需要项目；
- 明确本地运行、不依赖大模型、不上传知识库的信任优势；
- 避免机械堆砌关键词或承诺尚未实现的功能。

### package.json

将 description 改成结果导向的产品说明，并在 keywords 中增加：

- `wechat-article`
- `wechat-official-account`
- `obsidian`
- `logseq`
- `markdown-export`
- `article-archiver`
- `local-first`
- `personal-knowledge-management`

### GitHub 远程元数据

验证本地改动后，使用当前 GitHub 登录状态更新仓库：

- Description：`Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases.`
- Topics：`wechat`、`wechat-article`、`wechat-official-account`、`markdown`、`obsidian`、`logseq`、`knowledge-base`、`article-archiver`、`local-first`、`cli`、`typescript`、`personal-knowledge-management`

只修改 Description 与 Topics，不改仓库可见性、主页 URL、分支设置或其他远程配置。

## 修改范围

实施阶段修改以下文件：

- `skills/alskai-notebank/SKILL.md`
- `skills/alskai-notebank/agents/openai.yaml`
- `.claude/commands/alskai-notebank.md`
- `README.md`
- `package.json`

除本设计文档外，不新增用户文档或业务代码。

## 验证方案

### Skill 基线与回归

修改前记录至少三类自然语言请求的基线表现：

1. “帮我把这篇公众号文章保存到 Obsidian。”
2. “这些微信文章以后可能失效，帮我归档到本地知识库。”
3. “把 Excel 里的公众号链接批量整理成 Markdown。”

修改后使用同类但不完全相同的请求复测，并加入反例：

- “帮我写一篇微信公众号文章。”
- “把 Markdown 排版后发布到公众号。”
- “分析这个公众号的运营策略。”

成功标准：正例能够识别并正确使用 skill，反例不触发归档流程。

### 文件与项目验证

- 使用官方 skill 校验脚本检查 frontmatter、命名和 metadata。
- 检查 SKILL.md 的词数和 description 长度，避免上下文膨胀。
- 运行 `npm test`，确认文档与 metadata 修改没有影响现有 CLI。
- 审查 git diff，确认没有改变命令行为、合规边界或加入未实现承诺。
- 读取 GitHub 远程元数据，确认 Description 与 Topics 已按设计生效。

## 非目标

- 不修改抓取、解析、存储、导入或去重代码。
- 不发布 npm 包或创建新版本。
- 不新增落地页、博客文章或独立 SEO 内容页。
- 不重命名仓库、npm 包、CLI 或 skill。
- 不自动提交或推送实施阶段的代码，除非用户另行要求。
