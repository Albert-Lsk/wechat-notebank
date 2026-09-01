# wechat-notebank

> 把值得保留的微信公众号文章转成由自己掌控的本地 Markdown，沉淀到 Obsidian、Logseq 或个人知识库，随时搜索、引用和复盘。

Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases.

[![Install from GitHub](https://img.shields.io/badge/install-GitHub-black?style=flat-square)](#安装或更新)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

## 这是什么

`wechat-notebank` 是一个本地命令行工具，用 Chrome 打开微信公众号文章，提取文章内容，然后保存为带 Frontmatter 的 Markdown 文件。

抓取、解析和写入都在本机完成，工具不会上传你的知识库。保存原文不依赖大模型，也不需要 OpenAI / Claude / Gemini API key。当前核心流程是：

```text
微信公众号文章链接 -> 本机 Chrome 打开页面 -> 解析 HTML -> 保存 Markdown
```

可选的内容加工由用户当前使用的 Codex、Claude Code 等 Agent 完成，不需要为 `wechat-notebank` 额外配置模型 API key。所有候选内容都会先进入待审核加工包，只有用户明确批准后才发布到正式知识库。

最短用法：

```bash
alskai-notebank "https://mp.weixin.qq.com/s/xxxxx" -o ~/WeChatArticles
```

## 适用场景

- 保存公众号文章，在链接失效或难以找回之前留下一份本地副本
- 把微信文章转成 Markdown，迁移到 Obsidian、Logseq 或普通文件夹
- 将已经整理出的微信收藏链接沉淀到可搜索、可引用的个人知识库
- 按发布日期、来源链接、作者和公众号管理研究资料
- 用 Excel 批量归档一批公众号文章链接

工具需要目标文章仍可在本机 Chrome 中正常打开，不负责恢复已经失效或无权访问的内容。

## 效果预览

文件夹结构：

<img width="2420" height="1022" alt="image" src="https://github.com/user-attachments/assets/edc2d7d9-9265-42f8-af29-490063b3b44e" />

抓取后的原文：

<img width="2410" height="1684" alt="image" src="https://github.com/user-attachments/assets/86d9eb95-5ab2-43b8-a028-a09b04a4dedd" />

## 特性

- 一行命令保存微信公众号文章
- 支持指定输出目录
- 支持 Excel 批量导入
- 自动按文章真实发布日期命名
- 自动写入标题、作者、公众号、发布时间、原文链接等元数据
- 输出 Markdown + Frontmatter，适合 Obsidian 等知识库
- 保存原文不依赖大模型；内容加工复用当前 Agent，不需要额外 API key
- Windows / macOS / Linux 都可用，前提是本机能运行 Node.js 和 Chrome

## 环境要求

- Node.js 20 或更高版本
- npm
- 本机已安装 Chrome
- 当前网络环境可以在 Chrome 里打开目标微信公众号文章

如果你的 Chrome 不在默认路径，可以设置 `WECHAT_NOTEBANK_CHROME_PATH`。

Windows PowerShell：

```powershell
$env:WECHAT_NOTEBANK_CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Windows cmd：

```bat
set WECHAT_NOTEBANK_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

macOS / Linux：

```bash
export WECHAT_NOTEBANK_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 安装或更新

首版 Agent 自助安装支持 macOS Apple Silicon。运行依赖 Node.js 20+、npm 和 Google Chrome；工具会诊断这些依赖，但不会替你安装它们。

安装固定的 GitHub Release 标签，避免使用持续变化的开发分支。标准安装路径是：下载 Release 资产，校验 SHA-256，再从本地 tgz 安装：

```bash
curl -LO https://github.com/Albert-Lsk/wechat-notebank/releases/download/v0.2.0/wechat-notebank-0.2.0.tgz
curl -LO https://github.com/Albert-Lsk/wechat-notebank/releases/download/v0.2.0/wechat-notebank-0.2.0.tgz.sha256
shasum -a 256 -c wechat-notebank-0.2.0.tgz.sha256
npm install -g --prefix "$HOME/.local" ./wechat-notebank-0.2.0.tgz
ALSKAI_NOTEBANK="$HOME/.local/bin/alskai-notebank"
```

`~/.local` 是当前用户可写目录，因此不需要 `sudo`，也不用修改 shell 配置。安装或更新 Agent 集成时，必须明确目标。可以先预演，再正式执行：

```bash
"$ALSKAI_NOTEBANK" setup --agents codex,claude --dry-run --json
"$ALSKAI_NOTEBANK" setup --agents codex,claude --json
"$ALSKAI_NOTEBANK" doctor --json
```

只使用 Codex 时传 `codex`，只使用 Claude Code 时传 `claude`。`setup` 会安装当前包附带的 Skill；Claude Code 还会安装 `/alskai-notebank` 命令。已有文件更新前会备份，失败时会恢复，重复执行不会重复改写相同版本。成功后请重启 Codex 或 Claude Code，让当前会话重新发现 Skill。

### 机器上装过旧版本

这台机器装过旧版本时，先显式清理，再执行上面的标准安装路径：

```bash
rm -rf "$HOME/.local/lib/node_modules/wechat-notebank"
rm -f "$HOME/.local/bin/alskai-notebank" "$HOME/.local/bin/wechat-notebank"
```

第一条命令删除旧版本安装在 `~/.local` 下的 `node_modules` 目录，第二条删除 `alskai-notebank` 和 `wechat-notebank` 两个旧入口文件。标准安装命令不带 `--force`：旧版本残留会让 `npm install` 在冲突时大声失败并整体退出，而不是安静地装一半；先清理再安装，得到的结果才是完整、可校验的。

你也可以把下面这段原样发给具备终端权限的 Agent：

```text
请阅读 https://github.com/Albert-Lsk/wechat-notebank 的 README，帮我安装或更新固定的 v0.2.0 版本。先确认当前设备是 macOS Apple Silicon，并检查 Node.js 20+、npm 和 Google Chrome；不要使用 sudo，不要从 main 安装，也不要修改 shell 配置。把固定 Release 资产安装到当前用户的 ~/.local，并始终用 ~/.local/bin/alskai-notebank 调用工具。询问我要安装 Codex、Claude Code 还是两者，然后先运行 setup --dry-run --json 展示影响，经我确认后执行 setup --json，再运行 doctor --json 验证。最后提醒我重启对应 Agent。安装完成后需要重启 Agent 会话，Skill 才会被发现（setup 成功时会返回 restartRequired: true）。若固定 Release 尚未发布，停止安装并明确告诉我，不要改用其他来源。
```

### 安装排障

安装或 `setup` 失败时，先运行只读诊断，按失败的检查项定位原因：

```bash
"$ALSKAI_NOTEBANK" doctor --json
```

`platform`、`node`、`npm` 或 `chrome` 检查失败表示运行环境未就绪，先按「环境要求」补齐依赖，工具不会替你安装它们。诊断之外仍然安装失败时，按「机器上装过旧版本」小节的清理命令删除旧安装，再重新执行标准安装路径（下载 tgz → 校验 SHA-256 → 安装）。

安装后推荐使用 `alskai-notebank` 命令。`wechat-notebank` 是兼容旧用法的命令别名，两者调用的是同一个工具。下面继续使用绝对路径，因此即使没有修改 PATH 也能运行：

```bash
"$ALSKAI_NOTEBANK" --help
"$HOME/.local/bin/wechat-notebank" --help
```

`wechat-notebank` 暂未发布到 npm registry。如果你运行下面命令遇到 `404 Not Found`，说明 npm 包还没发布：

```bash
npm install -g wechat-notebank
```

### v0.2.0 首版边界

- Agent 自助安装、`setup` 和 `doctor` 只支持 macOS Apple Silicon。
- 运行前需要用户自行安装 Node.js 20+、npm 和 Google Chrome；工具不会安装系统依赖，不使用 `sudo`，也不修改 shell 配置。
- 首版只通过固定 GitHub Release 资产安装，不发布 npm registry 包，也不提供自动更新服务。
- 首版不提供独立 macOS 程序；具备 Apple Developer Program、Developer ID 签名和公证流程后，再另立规格开发独立程序。

## 快速开始

### macOS / Linux

```bash
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output ~/WeChatArticles
```

也可以省略 `fetch`：

```bash
alskai-notebank "https://mp.weixin.qq.com/s/xxxxx" -o ~/WeChatArticles
```

### Windows PowerShell

```powershell
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output "$HOME\WeChatArticles"
```

### Windows cmd

```bat
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output "%USERPROFILE%\WeChatArticles"
```

### 关于 `~`

新版会把下面两种写法识别为当前用户的 home 目录：

```bash
~/WeChatArticles
~\WeChatArticles
```

不过在 Windows 上，最稳妥的写法仍然是：

```bat
%USERPROFILE%\WeChatArticles
```

或 PowerShell：

```powershell
$HOME\WeChatArticles
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `alskai-notebank init` | 使用原有引导初始化项目知识库 |
| `alskai-notebank init --scope global --archive-path <folder>` | 设置用户全局默认配置 |
| `alskai-notebank init --scope project --archive-path <folder>` | 设置当前项目覆盖配置 |
| `alskai-notebank setup --agents <targets> [--dry-run] --json` | 安装或更新指定 Agent 集成 |
| `alskai-notebank doctor --json` | 只读诊断环境、CLI、Skill、配置与加工包完整性 |
| `alskai-notebank pack create --source <file> --manifest <manifest.json> --json` | 创建或修订待审核加工包 |
| `alskai-notebank pack update <pack> --manifest <manifest.json> --json` | 记录 L4 用户原话与 Agent 整理稿 |
| `alskai-notebank pack approve <pack> --items <ids> --json` | 选择性审批并发布 L2/L3/L4 候选 |
| `alskai-notebank pack reject <pack> --json` | 拒绝尚未完成审批的加工包 |
| `alskai-notebank pack revoke <pack> --items <ids> --json` | 安全撤销已发布候选及其双链 |
| `alskai-notebank <url>` | 保存单篇文章到默认路径 |
| `alskai-notebank fetch <url>` | 保存单篇文章，和上面等价 |
| `alskai-notebank <url> --output <folder>` | 保存到指定目录 |
| `alskai-notebank <url> -o <folder>` | `--output` 的简写 |
| `alskai-notebank import <file.xlsx>` | 从 Excel 批量导入 |
| `alskai-notebank --help` | 查看帮助 |

兼容旧命令：

```bash
wechat-notebank fetch <url> -o <folder>
wechat-notebank import <file.xlsx>
```

### 创建待审核加工包

Agent 根据原文生成 Manifest v1 后，可调用确定性命令创建加工包：

```bash
alskai-notebank pack create \
  --source "$HOME/WeChatArticles/L1_原文/WeChat/原文.md" \
  --manifest /tmp/manifest.json \
  --json
```

Manifest v1 顶层字段固定为：

```json
{
  "schemaVersion": 1,
  "sourceFile": "/absolute/path/to/L1_原文/WeChat/原文.md",
  "sourceUrl": "https://mp.weixin.qq.com/s/xxx",
  "processingGoal": null,
  "atomicNotes": [],
  "materials": [],
  "reviewQuestions": []
}
```

命令会在 `Inbox` 创建可见的待审核 Markdown，在 `.alskai-notebank/packs` 保存机器状态，并在加工包与原文之间建立 Wiki 双链。相同来源、相同加工目标和相同 Manifest 重复执行不会改写文件；内容变化时创建新 revision，并保留旧 revision。

### 记录 L4 用户回答

Agent 提问后，把用户原话按问题 ID 写入 `reviewAnswers`，把整理后的表达单独写入 `reviewDraft`。这两个字段与初始 Manifest 的其他字段一起提交：

```bash
alskai-notebank pack update \
  ~/WeChatArticles/Inbox/待审核加工包.md \
  --manifest /tmp/manifest-with-answers.json \
  --json
```

```json
{
  "reviewAnswers": {
    "L4-Q01": "用户的原始回答"
  },
  "reviewDraft": "Agent 基于用户回答整理的文稿"
}
```

可以先保存部分回答。已保存的用户原话不能删除或改写，整理稿在 L4 发布前可继续调整。

### 审批并发布候选

审核候选时，把加工包路径和需要保留的稳定 ID 交给 CLI：

```bash
alskai-notebank pack approve \
  ~/WeChatArticles/Inbox/待审核加工包.md \
  --items L2-01,L3-02 \
  --json
```

每个获批 L2 观点会生成一张独立原子卡片；同一篇来源在不同加工目标和 revision 中获批的 L3 内容会合并到唯一素材包，L4 贡献会合并到唯一阅读复盘。L4 必须已记录全部问题的用户原话与 Agent 整理稿，并一次选择全部 `L4-Qxx` ID。部分审批返回 `partial`；全部 L2、L3 和 L4 候选均已发布时返回 `approved`。重复更新或审批不会重复生成文件、贡献区块或双链。

### 拒绝或撤销

不采用尚未完成审批的加工包时，可直接拒绝：

```bash
alskai-notebank pack reject \
  ~/WeChatArticles/Inbox/待审核加工包.md \
  --json
```

拒绝 `partial` 加工包会保留此前已经发布的文件与双链，只终止未审批候选。需要删除已发布内容时，按稳定 ID 撤销：

```bash
alskai-notebank pack revoke \
  ~/WeChatArticles/Inbox/待审核加工包.md \
  --items L2-01,L3-02 \
  --json
```

撤销会同步更新加工包状态和受控双链。L2 文件只有在内容仍与发布哈希一致时才会删除；共享 L3/L4 使用各自隐藏状态中的当前聚合哈希，仍有其他加工目标贡献时只重建聚合文件。L4 必须一次撤销当前加工包的全部 `L4-Qxx`。若生成文件被人工编辑，命令返回 `DERIVED_FILE_MODIFIED` 并保持知识库不变。重复撤销同一候选返回 `unchanged`。

`doctor --json` 会只读报告生成文件缺失、哈希漂移、双链断裂、隐藏状态缺失，以及当前状态与 revision 快照不一致；它不会自动删除、改写或修复知识库。

## Manifest v1 规范

`pack create` 和 `pack update` 读取的 Manifest 是一份 JSON 文件。校验器对字段、类型和取值做确定性检查，任何一项不满足都会拒收整份 Manifest。

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schemaVersion` | number | 是 | 固定为 `1`，其他值会被拒收 |
| `sourceFile` | string | 是 | 原文 Markdown 的绝对路径，必须与命令的 `--source` 参数解析后一致 |
| `sourceUrl` | string | 是 | 非空字符串，必须与原文 Frontmatter 的 `sourceUrl` 一致 |
| `processingGoal` | string \| null | 是 | 加工目标；传 `null` 表示通用加工，同一来源不同目标会生成不同加工包 |
| `atomicNotes` | array | 是 | L2 候选数组，可为空，最多 99 项 |
| `materials` | array | 是 | L3 候选数组，可为空，最多 99 项 |
| `reviewQuestions` | array | 是 | L4 问题数组，可为空，最多 99 项 |

顶层不允许出现上述之外的字段；候选对象同样只接受各自表内列出的字段。

### L2 `atomicNotes` 候选

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 按数组顺序固定为 `L2-01`、`L2-02`…，且不能重复 |
| `title` | string | 是 | 非空卡片标题 |
| `claim` | string | 是 | 非空，一句话观点 |
| `evidence` | string | 是 | 非空，来自原文的支撑证据 |
| `boundary` | string | 是 | 非空，适用边界 |
| `useCases` | string[] | 是 | 非空字符串数组，可复用的场景 |

### L3 `materials` 候选

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 按数组顺序固定为 `L3-01`、`L3-02`…，且不能重复 |
| `kind` | string | 是 | 只接受 `quote`、`paraphrase`、`case`、`data` |
| `title` | string | 是 | 非空素材标题 |
| `content` | string | 是 | 非空；`kind` 为 `quote` 时必须原文精确命中，见下文 |
| `sourceSection` | string | 是 | 非空，素材在原文中的出处小节 |

### L4 `reviewQuestions` 候选

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 按数组顺序固定为 `L4-Q01`、`L4-Q02`…，且不能重复 |
| `question` | string | 是 | 非空，向用户提出的问题 |

### 完整示例

下面这份示例可以直接复制保存为 `manifest.json`，能通过校验器校验（`sourceFile` 换成你机器上的原文路径，`sourceUrl` 与原文 Frontmatter 保持一致）：

```json
{
  "schemaVersion": 1,
  "sourceFile": "/Users/you/WeChatArticles/L1_原文/WeChat/2026-04-13-5种Obsidian知识库架构对比.md",
  "sourceUrl": "https://mp.weixin.qq.com/s/abcDef123",
  "processingGoal": "提炼可复用的知识库搭建方法",
  "atomicNotes": [
    {
      "id": "L2-01",
      "title": "知识库先定结构，再选工具",
      "claim": "先确定四层结构，再挑选承载工具，日后迁移的成本才可控。",
      "evidence": "文章用同一套四层结构对比了五种主流工具的迁移路径。",
      "boundary": "只适用于个人知识库，不涉及团队协作场景。",
      "useCases": ["搭建个人知识库", "评估笔记工具"]
    }
  ],
  "materials": [
    {
      "id": "L3-01",
      "kind": "quote",
      "title": "结构先于工具",
      "content": "结构先于工具：先确定知识要怎么分层，再去挑选承载它的软件。",
      "sourceSection": "第二节：为什么结构先于工具"
    }
  ],
  "reviewQuestions": [
    {
      "id": "L4-Q01",
      "question": "你现在的知识库缺了哪一层，打算怎么补？"
    }
  ]
}
```

### quote 引用必须原文精确命中

`kind` 为 `quote` 的 L3 候选，`content` 必须能在原文正文中一字不差地找到（校验时会排除原文里的加工包双链衍生区）。校验器会拒收未命中的引用，`pack create --json` 的报错形态如下：

```json
{
  "ok": false,
  "command": "pack.create",
  "status": "failed",
  "error": {
    "code": "QUOTE_NOT_FOUND",
    "message": "直接引用 L3-01 未在原文中精确命中"
  }
}
```

`paraphrase`、`case`、`data` 三种类型不做精确命中校验，但内容仍应能对应到 `sourceSection` 指向的原文位置。

## 输出文件

保存后的文件名格式：

```text
YYYY-MM-DD-文章标题.md
```

其中 `YYYY-MM-DD` 来自微信公众号文章的真实发布时间，不是抓取时间。同名文件已存在时，会自动追加 `-2`、`-3` 等序号，避免覆盖。

Markdown 文件会包含 Frontmatter：

```yaml
---
title: "5种Obsidian知识库架构对比"
author: "数字牧民-Lsk"
wechatName: "数字牧民-Lsk"
pubDate: "2026-04-13"
sourceUrl: "https://mp.weixin.qq.com/s/xxx"
archivedAt: "2026-04-13T10:30:00Z"
tags: []
---

正文内容...
```

## 批量导入

把文章链接整理成 Excel 文件，读取第一个工作表。推荐两列：

| 微信文章 | 目标地址 |
|----------|----------|
| `https://mp.weixin.qq.com/s/xxxxx` | `~/WeChatArticles` |
| `https://mp.weixin.qq.com/s/yyyyy` | `/Users/you/Documents/AI-Bloggers` |

旧版三列表格也兼容：

| 序号 | 微信文章 | 目标地址 |
|------|----------|----------|
| 1 | `https://mp.weixin.qq.com/s/xxxxx` | `~/WeChatArticles` |

运行：

```bash
alskai-notebank import ./articles.xlsx
```

批量导入示例：

<img width="3024" height="1782" alt="dcaf7ffe60e5f993aeaa6cee32aba05f" src="https://github.com/user-attachments/assets/b3fd8420-709f-4f1a-aaed-4ade42823994" />

<img width="3024" height="1758" alt="82821712d400a4ed91e33f49b986807f" src="https://github.com/user-attachments/assets/8bbb3f42-da7b-4bdd-8753-9c87d7ff8b47" />

批量导入规则：

- 第一行可以是表头，形如 `微信文章 / 目标地址` 或 `序号 / 微信文章 / 目标地址` 时会自动跳过
- 序号列已废弃，可以不填
- 缺少文章链接或目标地址的行会被跳过
- 如果目标文件夹里已经有相同 `sourceUrl` 的文章，会跳过，不重复生成
- 某一行失败不会中断后续行，结束后会输出失败明细
- Numbers 表格请先导出为 Excel `.xlsx`

## 知识库结构

默认推荐用 Progressive Summarization 的四层结构：

```text
your-knowledge-base/
├── L1_原文/
│   └── WeChat/                                <-- fetch 的 --output 指向这里
│       └── 2026-04-13-文章标题.md              <-- fetch 时写入
├── Inbox/
│   └── 文章标题-packId前12位-r1.md             <-- pack create 时生成
├── L2_原子卡片/                                <-- pack approve 发布候选时生成
├── L3_引用素材/                                <-- pack approve 发布候选时生成
├── L4_阅读复盘/                                <-- pack approve 发布候选时生成
└── .alskai-notebank/                          <-- 隐藏状态区，第一条加工命令时生成
```

四层含义：

| 层级 | 名称 | 用途 |
|------|------|------|
| L1 | 原文 | 完整保存文章 |
| L2 | 原子卡片 | 拆解观点、概念和方法 |
| L3 | 引用素材 | 收藏可引用的句子、案例、结构 |
| L4 | 阅读复盘 | 写下自己的理解、问题和行动 |

这个结构不是强制的。你也可以用任意目录保存文章。

### `--output` 指向哪里

`fetch` 的 `--output`（简写 `-o`）指向文章归档目标目录，也就是 L1 层目录本身，例如 `<知识库根>/L1_原文/WeChat`。它与 `init` 配置的 `archivePath` 同义：命令里传了 `--output` 时优先使用命令值，否则使用配置值。文章 Markdown 会直接写入该目录，工具不会自动追加子目录：

```bash
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" \
  --output ~/WeChatArticles/L1_原文/WeChat
```

四类目录的生成时机：

| 目录 | 生成时机 |
|------|----------|
| L1 归档目录（`--output` / `archivePath` 指向的目录） | `fetch` 执行时创建，文章原文直接写入其中 |
| `Inbox/` | 第一条 `pack create` 执行时，在知识库根目录生成 |
| `L2_原子卡片/`、`L3_引用素材/`、`L4_阅读复盘/` | 第一次 `pack approve` 发布候选时生成 |
| `.alskai-notebank/`（隐藏状态区） | 第一条加工命令（`pack create`）执行时生成，保存加工包状态、revision 快照和聚合哈希 |

知识库根目录是 `L1_原文` 的上一级目录，`pack` 系列命令会根据原文路径自动定位它，`Inbox`、L2-L4 和隐藏状态区都生成在这里。只执行 `fetch` 不会创建 `Inbox`、L2-L4 或 `.alskai-notebank/`；`fetch` 期间出现的 `.alskai-notebank-locks` 是临时归档锁目录，命令结束后会自动清理。用 `init` 引导初始化时，四层骨架目录会一次性预建。

## 配置文件

全局默认配置位于 `~/.config/alskai-notebank/config.json`，项目覆盖配置 `.wechat-notebank.json` 位于当前工作目录。项目配置只覆盖其中明确写入的字段，其余值继承全局配置。

可以直接用非交互命令创建或更新配置：

```bash
alskai-notebank init --scope global \
  --archive-path ~/WeChatArticles \
  --processing-goal "提炼可复用的观点" \
  --auto-process

alskai-notebank init --scope project \
  --archive-path ./project-articles \
  --no-auto-process \
  --json
```

`processingGoal` 是可选自然语言；传入空字符串可清除当前 scope 的目标。`autoProcess` 未在任何配置中设置时默认为 `false`。初始化命令可以重复执行，省略的可选字段会保留原值。

配置文件示例：

```json
{
  "name": "MyNotes",
  "archivePath": "./output/L1_原文/WeChat",
  "createdAt": "2026-04-13T10:30:00Z",
  "processingGoal": "提炼可复用的观点",
  "autoProcess": false
}
```

配置优先级为：当次命令参数、项目配置、全局默认配置、首次使用引导。如果命令里传了 `--output` 或 `-o`，会优先使用命令指定的输出目录。项目配置损坏时会直接报错，不会静默回退到全局配置。

## 常见问题

### 两个命令有什么区别？

没有本质区别：

```bash
alskai-notebank fetch <url>
wechat-notebank fetch <url>
```

它们是同一个 CLI 的两个入口。推荐新用户使用 `alskai-notebank`。

### 需要接入大模型吗？

保存原文不需要。它只依赖本机 Chrome、Puppeteer 和 HTML 解析。

启用内容加工时，由你当前使用的 Codex、Claude Code 等 Agent 理解文章、生成候选并与你对话；`wechat-notebank` 不要求额外配置模型 API key。CLI 只负责确定性的校验、文件事务、审批、双链和撤销。

### 遇到 `Navigation timeout of 30000 ms exceeded` 怎么办？

这通常表示旧版本在等待微信页面所有网络请求结束。微信文章里的图片、统计脚本或风控页面可能让页面一直不进入“网络空闲”状态。

先按「安装或更新」小节的标准路径更新到固定版本（下载 tgz 和 sha256、校验后从本地 tgz 安装），然后重试：

```bash
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output ~/WeChatArticles
```

Windows cmd：

```bat
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output "%USERPROFILE%\WeChatArticles"
```

如果仍然失败，请检查：

1. 这篇文章能否在本机 Chrome 里手动打开
2. 页面是否变成登录页、验证码页、失效页或“微信公众平台”空壳页
3. 当前网络是否能访问微信图片和脚本资源
4. Chrome 路径是否需要用 `WECHAT_NOTEBANK_CHROME_PATH` 指定

网络较慢时，可以临时调大等待时间。

PowerShell：

```powershell
$env:WECHAT_NOTEBANK_NAVIGATION_TIMEOUT_MS="90000"
$env:WECHAT_NOTEBANK_CONTENT_TIMEOUT_MS="45000"
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output "$HOME\WeChatArticles"
```

cmd：

```bat
set WECHAT_NOTEBANK_NAVIGATION_TIMEOUT_MS=90000
set WECHAT_NOTEBANK_CONTENT_TIMEOUT_MS=45000
alskai-notebank fetch "https://mp.weixin.qq.com/s/xxxxx" --output "%USERPROFILE%\WeChatArticles"
```

### 报错 `解析失败：无法提取文章标题或内容`

这通常说明 Chrome 打开的页面不是正常文章正文。常见原因：

- 链接失效
- 页面要求登录或验证
- 微信返回了风控页
- 当前网络拿到的是“微信公众平台”空壳页
- 文章结构发生变化

可以先把链接复制到 Chrome 手动打开确认。如果 Chrome 里能正常看到正文，但工具仍失败，请带上链接、系统版本、Chrome 版本和完整错误信息提交 issue。

### `npm install -g wechat-notebank` 返回 404

当前包还没有发布到 npm registry。请按「安装或更新」小节的标准路径从固定 GitHub Release 安装：先下载 tgz 和 `.sha256` 文件并校验，再从本地 tgz 安装。

### Windows 里 `~/WeChatArticles` 能用吗？

新版工具会兼容 `~/WeChatArticles` 和 `~\WeChatArticles`。但为了减少 shell 差异，Windows 推荐直接写：

```bat
%USERPROFILE%\WeChatArticles
```

PowerShell 推荐：

```powershell
$HOME\WeChatArticles
```

## Claude Code / Codex Skill

如果你使用 Claude Code 或 Codex，安装 CLI 后用同一个入口安装配套 Skill。首版 `setup` 和 `doctor` 只支持 macOS Apple Silicon。

```bash
alskai-notebank setup --agents codex --json
alskai-notebank setup --agents claude --json
alskai-notebank setup --agents codex,claude --json
alskai-notebank doctor --json
```

安装后重启 Codex 或 Claude Code。

Claude Code 示例：

```text
/alskai-notebank https://mp.weixin.qq.com/s/xxxxx -o ~/WeChatArticles
/alskai-notebank import ./articles.xlsx
```

Skill 只负责调用本地 CLI，不会重新实现抓取逻辑，也不会把你的知识库上传到外部服务。

## 技术栈

<p align="left">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="40" height="40" alt="TypeScript"/>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="40" height="40" alt="Node.js"/>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg" width="40" height="40" alt="npm"/>
</p>

- TypeScript
- Puppeteer
- Cheerio
- Gray-matter

## 免责声明

本项目仅供个人学习、研究和资料归档使用。使用者应确保自己对所访问、下载、保存和处理的内容拥有合法访问权限，并遵守相关法律法规、平台规则与原作者版权声明。

使用本工具时，严禁用于以下场景：

- 未经授权访问、获取、解析、保存或传播他人账号、隐私、数据或非公开内容
- 绕过访问控制、登录限制、风控机制、反爬策略或任何安全保护措施
- 以商业目的进行批量采集、复制、转售、分发、搬运或建立内容库
- 对他人进行监控、追踪、画像、骚扰或其他侵害合法权益的行为
- 违反适用法律法规、监管要求、平台用户协议或第三方权利的任何行为

通过本工具保存的微信公众号文章及其图片、音视频、排版、评论、阅读数据等内容，其版权和相关权益归原作者、发布者或相应权利人所有。本项目不会改变任何第三方内容的权属关系，也不授予使用者对第三方内容的再发布、改编、商用或传播权利。

本工具按“现状”提供，不提供任何明示或暗示担保。因安装、运行、使用、二次开发或分发本项目而产生的任何风险、损失、争议或法律责任，均由使用者自行承担。项目维护者不对使用者的具体使用行为及其后果承担责任。

本项目与微信、WeChat、腾讯、公众号平台及其他第三方平台不存在任何从属、合作、授权或背书关系。所有商标、产品名称、服务名称均归其各自权利人所有。

一旦下载、安装、运行或使用本项目，即视为已阅读、理解并同意上述声明与附加条款。若不同意，请立即停止使用并删除本项目及其相关副本。

## License

MIT © [Albert-Lsk](https://github.com/Albert-Lsk)
