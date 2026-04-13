# wechat-notebank 🏦

> 让知识从收藏夹里逃出来，变成真正属于你的第二大脑

```
     _                               _   _
    (_) ___ _ __ ___ _   _  __ _  __| |_| |_ ___ _ __
    | |/ _ \ '__/ __| | | |/ _` |/ _` __| __/ _ \ '__|
    | |  __/ |  \__ \ |_| | (_| | (_| |_| ||  __/ |
    |_|\___|_|  |___/\__,_|\__,_|\__,_|\__\___\___|
```

[![npm](https://img.shields.io/npm/v/wechat-notebank?style=flat-square)](https://www.npmjs.com/package/wechat-notebank)
[![MIT License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

## ✨ 特性

- 📥 **一行命令**，永久保存微信公众号文章
- 🧠 **渐进式摘要法** (Progressive Summarization) 架构，让知识有序沉淀
- 📄 **Markdown + Frontmatter**，优雅的元数据管理
- 🔄 **零门槛上手**，首次使用自动引导配置
- 🌱 **个人知识基座**，从收集到创作的知识流水线

## 🎯 痛点

```
收藏了 =学会了 ❌
在收藏夹里吃灰 ✅
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

```bash
# npm 全局安装
npm install -g wechat-notebank

# 或者一行命令直接运行（无需安装）
npx wechat-notebank <command>
```

### 初始化

```bash
# 首次使用会自动引导，也可手动初始化
wechat-notebank init
```

### 存档文章

```bash
wechat-notebank fetch https://mp.weixin.qq.com/s/xxxxx
```

就这样，一秒钟后文章就安全地躺在你的知识库里了。

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
└── 📁 L4_原创文章/
    └── 📄 我的文章.md           ← 基于素材的二次创作
```

### 四层进化逻辑

| 层级 | 名称 | 输入 | 输出 |
|:---:|------|------|------|
| 🟡 L1 | 原文 | 公众号文章 URL | 完整 Markdown 存档 |
| 🔵 L2 | 原子卡片 | L1 原文 | 拆解的核心观点/概念 |
| 🟢 L3 | 引用素材 | L2 卡片 | 精选可引用的素材 |
| 🔴 L4 | 原创文章 | L3 素材 | 用自己的话重写的文章 |

```
阅读 → 存档 → 提炼 → 精选 → 创作
  ↑___________________|___________|
     这是一个持续的循环
```

## 📖 工作流示例

```
1️⃣  看到一篇好文章
2️⃣  wechat-notebank fetch <url>     # 存入 L1_原文
3️⃣  深度阅读，提炼要点               # 创建 L2_原子卡片
4️⃣  觉得这个概念很棒                 # 精选到 L3_引用素材
5️⃣  下次写文章时直接调用             # 在 L4_原创文章 中创作
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
| `wechat-notebank fetch <url>` | 存档文章 |
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
