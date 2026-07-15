# Domain docs

本项目采用单上下文领域文档，领域术语与边界统一记录在根目录 `CONTEXT.md`，重要架构决策记录在 `docs/adr/`。

## Agent 约定

- 开始领域建模或修改核心业务行为前，读取 `CONTEXT.md` 与相关 `docs/adr/` 文档。
- 文件或目录尚不存在时，静默继续；由 `domain-modeling` skill 在首次需要时创建。
- 代码、规格、Issue 和文档使用一致的领域词汇。
- 新方案与既有 ADR 冲突时，先明确指出冲突，再决定新增或替代 ADR。
