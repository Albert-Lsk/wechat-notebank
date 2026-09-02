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

## 多机协作回填约定

若在某台机器的会话中使用 Linear（ALS-xx 等）或其他票据系统推进了工作，结论必须在 GitHub Issues 回填留档：至少一条发布/决策记录 Issue（链接规格、计划文档与 release/tag）。不要求双向同步，也不要求过程票一一镜像；GitHub 保持唯一真源。此约定用于避免多机并行时两条线互不知情（2026-09-01 v0.3.0 直接发布与 Wayfinder 地图撞车的教训，留档见 #33）。

## 公开内容卫生

本仓库为 public 仓库，Issue、评论与 PR 描述全部公开可见。写公开内容前泛化三类信息：主机名/设备名、本机真实路径（`/Users/<name>/…`）、非仓库固有的账号昵称与个人标识；并默认不写入授权码、token、cookie 值与内网地址。

## Wayfinding operations

Wayfinder 使用 GitHub 原生父子 Issue 与依赖关系。地图和决策票都属于规划产物；除非地图 `Notes` 明确授权，否则不在地图内实施产品功能。

### 标签

- `wayfinder:map`：整个路线的索引与目的地。
- `wayfinder:research`：由 Agent 独立完成的事实调查。
- `wayfinder:prototype`：通过低成本原型或预演提高讨论清晰度。
- `wayfinder:grilling`：必须与用户逐问解决的决策。
- `wayfinder:task`：在决策前必须完成的人工或 Agent 操作。

### 创建与连接父子 Issue

先分别创建地图和 tickets，再在第二遍连接关系：

```bash
map_number=<地图编号>
child_number=<ticket 编号>
child_id="$(gh api "repos/Albert-Lsk/wechat-notebank/issues/$child_number" --jq .id)"

gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/Albert-Lsk/wechat-notebank/issues/$map_number/sub_issues" \
  -F "sub_issue_id=$child_id"
```

查询地图的直接子 Issue：

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/Albert-Lsk/wechat-notebank/issues/$map_number/sub_issues"
```

### 连接阻塞关系

“被阻塞 ticket”声明自己依赖“blocker”：

```bash
blocked_number=<被阻塞 ticket 编号>
blocker_number=<blocker 编号>
blocker_id="$(gh api "repos/Albert-Lsk/wechat-notebank/issues/$blocker_number" --jq .id)"

gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/Albert-Lsk/wechat-notebank/issues/$blocked_number/dependencies/blocked_by" \
  -F "issue_id=$blocker_id"
```

查询 ticket 的 blockers：

```bash
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "repos/Albert-Lsk/wechat-notebank/issues/$blocked_number/dependencies/blocked_by"
```

只有当原生 API 不可用时，才在 ticket 正文顶部使用 `Parent: #编号` 与 `Blocked by: #编号` 回退约定。

### 认领、frontier 与解决

- 开始处理前先运行 `gh issue edit <编号> --add-assignee @me`；assignee 就是 claim。
- frontier 是地图的开放子 Issue 中：未指派、且所有 blockers 都已关闭的 tickets。
- 解决 ticket 时，把完整答案写入 resolution comment，关闭 ticket，再在地图 `Decisions so far` 追加一行标题链接与结论摘要。
- 新发现但尚不能精确提问的范围写入地图 `Not yet specified`；一旦问题足够清晰，再创建 ticket 并从雾区删除对应内容。
- 超出目的地的事项关闭后链接到地图 `Out of scope`，不写入 `Decisions so far`。
