# wechat-notebank

> 把值得保留的微信公众号文章转成由自己掌控的本地 Markdown，沉淀到 Obsidian、Logseq 或个人知识库，随时搜索、引用和复盘。

Archive WeChat Official Account articles as local Markdown for Obsidian, Logseq, and personal knowledge bases.

[![Install from GitHub](https://img.shields.io/badge/install-GitHub-black?style=flat-square)](#安装或更新)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

## 这是什么

`wechat-notebank` 是一个本地命令行工具，用 Chrome 打开微信公众号文章，提取文章内容，然后保存为带 Frontmatter 的 Markdown 文件。

抓取、解析和写入都在本机完成，工具不会上传你的知识库。它不需要接入大模型，也不需要 OpenAI / Claude / Gemini API key。当前核心流程是：

```text
微信公众号文章链接 -> 本机 Chrome 打开页面 -> 解析 HTML -> 保存 Markdown
```

大模型只会在以后做“摘要、标签、自动提炼”这类增强功能时才可能需要。保存原文这件事本身不依赖大模型。

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
- 不依赖大模型，不需要 API key
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

安装固定的 GitHub Release 标签，避免使用持续变化的开发分支：

```bash
npm install -g https://github.com/Albert-Lsk/wechat-notebank/archive/refs/tags/v0.2.0.tar.gz --force
```

安装或更新 Agent 集成时，必须明确目标。可以先预演，再正式执行：

```bash
alskai-notebank setup --agents codex,claude --dry-run --json
alskai-notebank setup --agents codex,claude --json
alskai-notebank doctor --json
```

只使用 Codex 时传 `codex`，只使用 Claude Code 时传 `claude`。`setup` 会安装当前包附带的 Skill；Claude Code 还会安装 `/alskai-notebank` 命令。已有文件更新前会备份，失败时会恢复，重复执行不会重复改写相同版本。成功后请重启 Codex 或 Claude Code，让当前会话重新发现 Skill。

你也可以把下面这段原样发给具备终端权限的 Agent：

```text
请阅读 https://github.com/Albert-Lsk/wechat-notebank 的 README，帮我安装或更新固定的 v0.2.0 版本。先确认当前设备是 macOS Apple Silicon，并检查 Node.js 20+、npm 和 Google Chrome；不要使用 sudo，不要从 main 安装，也不要修改 shell 配置。询问我要安装 Codex、Claude Code 还是两者，然后先运行 setup --dry-run --json 展示影响，经我确认后执行 setup --json，再运行 doctor --json 验证。最后提醒我重启对应 Agent。若固定 Release 尚未发布，停止安装并明确告诉我，不要改用其他来源。
```

安装后推荐使用 `alskai-notebank` 命令。`wechat-notebank` 是兼容旧用法的命令别名，两者调用的是同一个工具。

```bash
alskai-notebank --help
wechat-notebank --help
```

`wechat-notebank` 暂未发布到 npm registry。如果你运行下面命令遇到 `404 Not Found`，说明 npm 包还没发布：

```bash
npm install -g wechat-notebank
```

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
| `alskai-notebank doctor --json` | 只读诊断环境、CLI、Skill 与配置 |
| `alskai-notebank pack create --source <file> --manifest <manifest.json> --json` | 创建或修订待审核加工包 |
| `alskai-notebank pack update <pack> --manifest <manifest.json> --json` | 记录 L4 用户原话与 Agent 整理稿 |
| `alskai-notebank pack approve <pack> --items <ids> --json` | 选择性审批并发布 L2/L3/L4 候选 |
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
│   └── WeChat/
│       └── 文章原文.md
├── L2_原子卡片/
├── L3_引用素材/
└── L4_阅读复盘/
```

四层含义：

| 层级 | 名称 | 用途 |
|------|------|------|
| L1 | 原文 | 完整保存文章 |
| L2 | 原子卡片 | 拆解观点、概念和方法 |
| L3 | 引用素材 | 收藏可引用的句子、案例、结构 |
| L4 | 阅读复盘 | 写下自己的理解、问题和行动 |

这个结构不是强制的。你也可以用任意目录保存文章。

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

不需要。保存原文只依赖本机 Chrome、Puppeteer 和 HTML 解析。

大模型只适合做额外增强，比如自动摘要、自动打标签、提炼金句。目前这些不是保存原文的必要条件。

### 遇到 `Navigation timeout of 30000 ms exceeded` 怎么办？

这通常表示旧版本在等待微信页面所有网络请求结束。微信文章里的图片、统计脚本或风控页面可能让页面一直不进入“网络空闲”状态。

先更新到固定版本：

```bash
npm install -g https://github.com/Albert-Lsk/wechat-notebank/archive/refs/tags/v0.2.0.tar.gz --force
```

然后重试：

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

当前包还没有发布到 npm registry。请使用 GitHub 安装：

```bash
npm install -g https://github.com/Albert-Lsk/wechat-notebank/archive/refs/tags/v0.2.0.tar.gz --force
```

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
