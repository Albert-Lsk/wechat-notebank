# wechat-notebank 🏦

> 让知识从收藏夹里逃出来，变成真正属于你的第二大脑

[![Install from GitHub](https://img.shields.io/badge/install-GitHub-black?style=flat-square)](#安装)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

## ✨ 特性

- 📥 **一行命令**，永久保存微信公众号文章
- 📁 **指定目录保存**，单篇文章可直接写入任意文件夹
- 📊 **Excel 批量导入**，一张表批量抓取并保存到不同目录
- 🗓️ **按发布日期命名**，文件名自动使用文章真实发布日期
- 🧠 **渐进式摘要法** (Progressive Summarization) 架构，让知识有序沉淀
- 📄 **Markdown + Frontmatter**，优雅的元数据管理
- 🔄 **零门槛上手**，首次使用自动引导配置
- 🌱 **个人阅读档案**，让好文章可检索、可复盘、可追溯出处

## 🎯 痛点

```
收藏了 ≠ 学会了
找得到、能复盘、可追溯，才算真正沉淀
```

你是不是也有这样的困扰？

- 微信公众号文章看了一堆，但事后想找怎么也找不到
- 收藏夹越来越长，知识却越来越零散
- 想整理但不知道从何下手

**wechat-notebank** 解决的就是这个问题 —— 不是单纯的保存，而是帮你建立一套**可持续运转的个人知识系统**。

**文件夹结构**
<img width="2420" height="1022" alt="image" src="https://github.com/user-attachments/assets/edc2d7d9-9265-42f8-af29-490063b3b44e" />


**抓取的原文**
<img width="2410" height="1684" alt="image" src="https://github.com/user-attachments/assets/86d9eb95-5ab2-43b8-a028-a09b04a4dedd" />

## 🚀 快速开始

### 安装

目前推荐从 GitHub 安装：

```bash
npm install -g https://github.com/Albert-Lsk/wechat-notebank/archive/refs/heads/main.tar.gz
```

`wechat-notebank` 还没有发布到 npm registry。发布后也可以使用：

```bash
npm install -g wechat-notebank
npx wechat-notebank <command>
```

> 如果 `npm install -g wechat-notebank` 返回 `404 Not Found`，说明包还没有发布到 npm registry。
> 维护者登录 npm 后在项目根目录执行 `npm publish --access public`，发布成功后上面的 npm/npx 命令才会生效。

工具会调用本机已安装的 Chrome 抓取微信公众号文章。如果你的 Chrome 不在默认路径，可设置 `WECHAT_NOTEBANK_CHROME_PATH` 指向 Chrome 可执行文件。

### 初始化

```bash
# 首次使用会自动引导，也可手动初始化
wechat-notebank init
```

### 存档文章

```bash
wechat-notebank fetch https://mp.weixin.qq.com/s/xxxxx
```

如果没有指定输出目录，文章会保存到配置文件里的默认知识库路径。首次使用时，工具会自动引导你创建配置。

也可以把单篇文章保存到指定文件夹：

```bash
wechat-notebank fetch https://mp.weixin.qq.com/s/xxxxx --output ~/WeChatArticles
# 或
wechat-notebank fetch https://mp.weixin.qq.com/s/xxxxx -o ~/WeChatArticles
```

如果目标文件夹不存在，工具会自动创建。

保存后的文件名格式为：

```text
YYYY-MM-DD-文章标题.md
```

其中 `YYYY-MM-DD` 来自微信公众号文章的真实发布时间，不是抓取时间。若同名文件已存在，工具会自动追加 `-2`、`-3` 等序号，避免覆盖已有文件。

### 批量导入

把文章表格整理成 Excel 文件，读取第一个工作表。推荐使用两列：

| 微信文章 | 目标地址 |
|----------|----------|
| `https://mp.weixin.qq.com/s/xxxxx` | `~/WeChatArticles` |
| `https://mp.weixin.qq.com/s/yyyyy` | `/Users/you/Documents/AI-Bloggers` |

旧版三列表格也仍然兼容：

| 序号 | 微信文章 | 目标地址 |
|------|----------|----------|
| 1 | `https://mp.weixin.qq.com/s/xxxxx` | `~/WeChatArticles` |

然后运行：

```bash
wechat-notebank import ./articles.xlsx
```

工具会按行读取表格，把每一行的文章保存到对应的文件夹。

- 第一行可以是表头，表头形如 `微信文章 / 目标地址` 或 `序号 / 微信文章 / 目标地址` 时会自动跳过。
- 序号列已废弃，不再需要填写。
- 任意一行缺少微信文章链接或目标地址时，会跳过这一行。
- 如果目标文件夹里已经有相同 `sourceUrl` 的文章，会跳过，不会重复抓取或生成 `-2.md`。
- 某一行抓取失败不会中断后续行，导入结束后会输出失败明细。
- Numbers 表格请先导出为 Excel（`.xlsx`）后再导入。

## 🗂️ Progressive Summarization 架构

这不是普通的文件夹，这是 Tiago Forte 提出的**渐进式摘要法**，专门为知识工作者的阅读流程设计：

```
📁 your-knowledge-base/
│
├── 📁 L1_原文/
│   └── 📁 WeChat/
│       └── 📄 文章原文.md       ← 原始存档，完整保留
│
├── 📁 L2_原子卡片/
│   └── 📄 原子想法.md           ← 提炼核心观点，一事一卡
│
├── 📁 L3_引用素材/
│   └── 📄 金句摘录.md           ← 可直接引用的素材
│
└── 📁 L4_阅读复盘/
    └── 📄 阅读复盘.md           ← 保留出处，记录自己的理解
```

### 四层进化逻辑

| 层级 | 名称 | 输入 | 输出 |
|:---:|------|------|------|
| 🟡 L1 | 原文 | 公众号文章 URL | 完整 Markdown 存档 |
| 🔵 L2 | 原子卡片 | L1 原文 | 拆解的核心观点/概念 |
| 🟢 L3 | 引用素材 | L2 卡片 | 精选可引用的素材 |
| 🔴 L4 | 阅读复盘 | L3 素材 | 带出处记录自己的理解和问题 |

这四层不是一次性的整理任务，而是一条可以反复回看的知识加工路径。

## 📖 工作流示例

```
1️⃣  看到一篇好文章
2️⃣  wechat-notebank fetch <url>     # 存入 L1_原文
    或 wechat-notebank fetch <url> --output <文件夹地址>
3️⃣  文章按发布日期保存为 Markdown
4️⃣  深度阅读，提炼要点               # 创建 L2_原子卡片
5️⃣  觉得这个概念很棒                 # 精选到 L3_引用素材
6️⃣  需要回看时追溯出处               # 在 L4_阅读复盘 中沉淀自己的理解
```

## ⚙️ 配置

配置文件 `.wechat-notebank.json` 位于仓库根目录：

```json
{
  "name": "MyNotes",
  "archivePath": "./output/L1_原文/WeChat",
  "createdAt": "2026-04-13T10:30:00Z"
}
```

## 🛠️ 命令

| 命令 | 说明 |
|------|------|
| `wechat-notebank init` | 初始化知识库 |
| `wechat-notebank fetch <url>` | 存档文章到默认知识库 |
| `wechat-notebank fetch <url> --output <folder>` | 存档文章到指定文件夹 |
| `wechat-notebank fetch <url> -o <folder>` | `--output` 的简写 |
| `wechat-notebank import <Excel文件地址>` | 从 Excel 批量导入文章 |
| `wechat-notebank --help` | 显示帮助 |

## 📄 文章元数据

存档的文章包含完整的 Frontmatter：

```yaml
---
title: "5种Obsidian知识库架构对比"
author: "数字牧民-Lsk"
wechatName: "数字牧民-Lsk"
pubDate: "2026-04-13"
sourceUrl: "https://mp.weixin.qq.com/s/xxx"
archivedAt: "2026-04-13T10:30:00Z"
tags: ["Obsidian", "知识管理", "工具"]
---

正文内容...
```

## 🧩 技术栈

<p align="left">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="40" height="40" alt="TypeScript"/>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg" width="40" height="40" alt="Node.js"/>
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg" width="40" height="40" alt="npm"/>
</p>

- **TypeScript** — 类型安全，代码即文档
- **Puppeteer** — 无头浏览器，绕过反爬
- **Cheerio** — 轻量 HTML 解析
- **Gray-matter** — 优雅的 Frontmatter

## 🌟 设计哲学

> **工具应该消失在工作流后面**

wechat-notebank 遵循极简主义：

- **零学习成本** — 会用微信就会用
- **最小认知负荷** — 不需要理解复杂概念
- **最大知识沉淀** — 让每一篇读过的文章都不白读

## 📝 License

MIT © [Albert-Lsk](https://github.com/Albert-Lsk)

---

<div align="center">

*"你的知识库应该像第二大脑一样工作，而不是像仓库一样堆积"*

</div>
