# ADR 0001：采用 GitHub Release 与 npm registry 双通道发布

- 状态：已接受（2026-09-13，取代 2026-07-15 的「仅 GitHub Release」决策）
- 关联：#41（Spec：v0.4 安装体验升级）、#42（发布管线）、#43（本文档与 README 叙事）

## 背景

2026-07-15 的 agent-first 知识加工规格（`docs/superpowers/specs/2026-07-15-agent-first-knowledge-processing-spec.md`）决定首版只通过固定 GitHub Release 标签分发，不发布 npm registry。当时的理由是固定版本、确定性安装与避免维护面扩大。

实际采用验证（#16、#21、#22）发现，四步安装（下载 tgz → 校验 SHA-256 → `npm install -g --prefix` 本地包 → 定位 `~/.local/bin`）是新用户与 Agent 的第一道摩擦；且 npm 通道缺失意味着 Windows / Linux 用户没有对等的安装指引。

## 决策

自 v0.4 起采用双通道发布，两个通道共用同一份经边界校验的构建产物：

1. **GitHub Release 通道（保留）**：固定 Tag 双附件（`.tgz` + `.sha256`），面向 Agent 自助安装与需要人工核对供应链的场景，行为与既有文档完全一致。
2. **npm registry 通道（新增）**：`npm install -g wechat-notebank@<version>` 一行安装、`npx wechat-notebank@<version>` 免安装试用，使 Windows / Linux 获得对等通道。

约束：

- 两个通道必须使用同一构建产出的同一份 tgz（同 SHA），发布流程见 `RELEASING.md`。
- npm 侧不维护额外 dist-tag 承诺，`latest` 随版本发布自然前进；GitHub 侧不提供浮动 `latest` 下载地址。
- 不提供自动更新服务，不制作独立可执行程序（维持既有版本边界）。

## 后果

- 正面：安装从四步降为一行；三平台安装叙事统一；`npx` 支持零成本试用。
- 正面：npm 自带 registry integrity 校验，与既有 SHA-256 校验路径互为补充。
- 负面：每次发布多一个环节（授权后的 `npm publish`）；发布令牌有 90 天有效期硬限制（read-write granular token），需要按 `RELEASING.md` 轮换。
- 中性：本 ADR 取代规格中的「不发布 npm」条款；`RELEASING.md` 与 README 的对应文本已同步改写，文档锁测试（`tests/release-docs.test.js`）防止回退。
