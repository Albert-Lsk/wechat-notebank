# alskai-notebank JTBD、SEO 与 GEO 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有名称和 CLI 行为的前提下，让 Agent 能从自然语言任务发现 `alskai-notebank`，并提升项目在 GitHub 与搜索引擎中的可发现性。

**Architecture:** 将同一个 JTBD 定位分别投射到 Agent 触发层、产品展示层和公开搜索层。CLI 继续承担全部抓取与归档行为，skill 只做意图识别和命令映射，README、package metadata 与 GitHub metadata 负责用户发现和理解。

**Tech Stack:** Markdown、YAML、JSON、Node.js/npm、GitHub CLI、Codex skill metadata

---

## 文件职责

- `skills/alskai-notebank/SKILL.md`：Agent 触发条件、自然语言到 CLI 的映射和执行边界。
- `skills/alskai-notebank/agents/openai.yaml`：Codex UI 展示名称、简介和默认提示词。
- `.claude/commands/alskai-notebank.md`：Claude 斜杠命令入口和执行约束。
- `README.md`：GitHub 首屏价值、搜索语义、安装与使用说明。
- `package.json`：包描述和机器可读关键词。
- GitHub repository metadata：远程 Description 与 Topics。

用户明确要求本轮实施改动不提交、不推送，因此所有 commit 步骤均省略；设计文档已有独立提交。

### Task 1：记录 skill 发现边界基线

**Files:**
- Read: `skills/alskai-notebank/SKILL.md`
- Record: tool output in the active task transcript

- [x] **Step 1：建立正例基线**

使用未暴露目标答案的独立 Agent，分别判断以下请求应调用哪个已安装 skill，并说明依据：

```text
帮我把这篇公众号文章保存到 Obsidian：<URL>
这些微信文章以后可能失效，帮我归档到本地知识库。
把 Excel 里的公众号链接批量整理成 Markdown。
```

预期基线证据：记录 Agent 是否选择 `alskai-notebank`，以及它依赖了哪些触发词。

- [x] **Step 2：建立反例基线**

使用同一评估方式测试：

```text
帮我写一篇微信公众号文章。
把这篇 Markdown 排版后发布到公众号。
分析这个公众号的运营策略。
```

预期：不选择 `alskai-notebank`。

### Task 2：优化 Agent 触发与展示层

**Files:**
- Modify: `skills/alskai-notebank/SKILL.md`
- Modify: `skills/alskai-notebank/agents/openai.yaml`
- Modify: `.claude/commands/alskai-notebank.md`

- [x] **Step 1：重写 skill description**

将 frontmatter description 改为仅描述触发条件的英文文本，覆盖保存、备份、归档、导出、迁移、Markdown、Obsidian、Logseq、本地知识库、Excel 和 Numbers，同时避免概括执行步骤：

```yaml
description: Use when the user wants to save, archive, back up, download, export, or migrate WeChat public account articles; convert WeChat articles to Markdown; move WeChat links into Obsidian, Logseq, a local folder, or a personal knowledge base; batch import article URLs from Excel or Numbers; or keep valuable WeChat content from becoming lost or unsearchable.
```

- [x] **Step 2：加入自然语言任务映射**

在正文中加入精简的 `Intent Mapping`：

```markdown
## Intent Mapping

Map the user's desired outcome to the CLI even when they do not name the tool:

- Saving, backing up, exporting, or archiving one WeChat article -> single-article command.
- Moving WeChat articles into Obsidian, Logseq, Markdown, a local folder, or a personal knowledge base -> single-article command for one URL, import for a workbook.
- Preserving articles before links disappear or become hard to find -> archive locally; do not promise recovery of already unavailable content.
- Writing, publishing, formatting, summarizing, or analyzing content without an archive request -> do not use this skill.
```

保留现有 Numbers 导出流程、成功判断、幂等报告、账户交互禁令和知识库隐私规则。

- [x] **Step 3：更新 Codex UI metadata**

将 `agents/openai.yaml` 更新为：

```yaml
interface:
  display_name: "ALSKai 公众号文章归档"
  short_description: "把公众号文章保存为本地 Markdown，沉淀到 Obsidian 等个人知识库。"
  default_prompt: "Use $alskai-notebank to archive this WeChat article as local Markdown in my knowledge base."
```

- [x] **Step 4：更新 Claude 命令说明**

在 `.claude/commands/alskai-notebank.md` 开头明确：该命令把值得保留的公众号文章归档为本地 Markdown，适用于 Obsidian、Logseq 或普通文件夹。保持 `$ARGUMENTS`、CLI 调用和禁止账户交互规则不变。

### Task 3：优化 README 与 package metadata

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [x] **Step 1：重构 README 首屏**

在标题下使用结果导向的中文主张：

```markdown
> 把值得保留的微信公众号文章转成由自己掌控的本地 Markdown，沉淀到 Obsidian、Logseq 或个人知识库，随时搜索、引用和复盘。

Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases.
```

在安装说明之前增加最短可运行命令，并明确本地运行、不依赖大模型、不上传知识库。

- [x] **Step 2：将“适合谁”改成任务场景**

使用自然语言覆盖：保存公众号文章、微信文章转 Markdown、迁移到 Obsidian/Logseq、本地归档、防止链接失效、Excel 批量整理。不得声称自动读取微信收藏夹或恢复已失效文章。

- [x] **Step 3：更新 package metadata**

将 description 更新为：

```json
"description": "Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases"
```

在保留现有关键词的基础上加入：

```json
"wechat-article",
"wechat-official-account",
"obsidian",
"logseq",
"markdown-export",
"article-archiver",
"local-first",
"personal-knowledge-management"
```

### Task 4：复测并验证本地改动

**Files:**
- Test: `skills/alskai-notebank/`
- Test: full project

- [x] **Step 1：复测正例与反例**

使用与基线不同措辞的独立 Agent：

```text
把这个 mp.weixin.qq.com 链接备份成 Markdown 放进我的 Logseq 资料库。
我整理了一份 Numbers 表格，里面的公众号文章想批量存到本地。
微信收藏里的文章越积越多，我已经导出了链接表，帮我做成本地可搜索资料。
帮我给公众号文章起三个标题。
把这篇文章复制到微信公众号编辑器。
研究这个账号为什么涨粉快。
```

成功标准：前三项选择 `alskai-notebank` 并映射到正确流程，后三项拒绝使用归档 skill。

- [x] **Step 2：运行 skill 校验**

```bash
python3 /Users/alskai/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/alskai-notebank
wc -w skills/alskai-notebank/SKILL.md
```

预期：校验通过；SKILL.md 保持在 500 词以内。

- [x] **Step 3：校验结构化文件与项目测试**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('package.json OK')"
npm test
git diff --check
```

预期：JSON 解析成功；全部现有测试通过；diff 无空白错误。

- [x] **Step 4：审查范围**

```bash
git status --short
git diff -- skills/alskai-notebank/SKILL.md skills/alskai-notebank/agents/openai.yaml .claude/commands/alskai-notebank.md README.md package.json
```

预期：只有设计约定的五个实施文件和未提交的计划文件发生变化，没有业务代码改动。

### Task 5：更新并核实 GitHub 元数据

**Files:**
- Modify remotely: `Albert-Lsk/wechat-notebank` Description and Topics

- [x] **Step 1：检查 GitHub 登录与当前元数据**

```bash
gh auth status
gh repo view Albert-Lsk/wechat-notebank --json description,repositoryTopics,url
```

预期：当前凭证可写目标仓库，并记录修改前状态；不得打印凭证内容。

- [x] **Step 2：更新 Description 与 Topics**

```bash
gh repo edit Albert-Lsk/wechat-notebank \
  --description "Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases." \
  --add-topic wechat \
  --add-topic wechat-article \
  --add-topic wechat-official-account \
  --add-topic markdown \
  --add-topic obsidian \
  --add-topic logseq \
  --add-topic knowledge-base \
  --add-topic article-archiver \
  --add-topic local-first \
  --add-topic cli \
  --add-topic typescript \
  --add-topic personal-knowledge-management
```

不得删除仓库已有 Topics；只追加设计指定的 Topics。

- [x] **Step 3：读取远程状态验收**

```bash
gh repo view Albert-Lsk/wechat-notebank --json description,repositoryTopics,url
```

预期：Description 精确匹配设计文案，指定 Topics 全部存在。

### Task 6：完成审计

- [x] **Step 1：逐项对照设计与目标**

确认五个文件、六组正反例、skill 校验、项目测试、diff、GitHub Description 和 Topics 均有直接证据。

- [x] **Step 2：保留实施改动为未提交状态**

不得运行 `git commit` 或 `git push`。最终报告列出改动文件、验证命令、远程元数据结果和仍然存在的可发现性风险。
