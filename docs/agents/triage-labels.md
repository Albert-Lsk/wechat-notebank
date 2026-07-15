# Triage labels

本项目使用以下标签表达 Issue 是否具备进入 Agent 实施队列的条件。

| 角色 | GitHub 标签 | 使用条件 |
| --- | --- | --- |
| 待分诊 | `needs-triage` | 尚未判断归属、价值或处理路径 |
| 等待信息 | `needs-info` | 缺少复现信息、需求输入或关键决策 |
| Agent 可实施 | `ready-for-agent` | 范围、验收条件和阻塞关系已明确，可独立实施 |
| 需要人工处理 | `ready-for-human` | 需要人工授权、判断或外部操作 |
| 不实施 | `wontfix` | 已明确不进入实施计划 |

## 约定

- 新建的 tracer-bullet ticket 在内容完整时直接标记为 `ready-for-agent`。
- 信息不足时移除 `ready-for-agent`，改用 `needs-info`。
- blocker 未关闭不改变 ticket 的内容完整性；是否进入可实施 frontier 由依赖关系决定。
