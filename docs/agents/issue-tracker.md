# Issue tracker：GitHub

本项目的 Issue 与 PRD 发布到 `Albert-Lsk/wechat-notebank` GitHub Issues，统一使用 `gh` 操作。

## 约定

- `/to-spec` 和 `/to-tickets` 产物发布为 GitHub Issue。
- 每张 tracer-bullet ticket 是独立 Issue。
- Ticket 使用 `ready-for-agent` 标签。
- 阻塞关系优先使用 GitHub 原生 issue dependencies。
- 原生依赖不可用时，在 Issue 正文顶部写 `Blocked by: #编号`。
- 所有 blocker 关闭后，该 Ticket 才进入可实施 frontier。
- 外部 Pull Request 不进入 triage 流程。
