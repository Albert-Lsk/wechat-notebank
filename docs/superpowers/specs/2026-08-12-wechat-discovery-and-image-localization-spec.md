# wechat-notebank 文章发现与图片本地化规格

> 状态：`ready-for-agent`
>
> 目标版本：`v0.3.0`
>
> 来源：飞书云盘 `wechat-monitor-公众号抓取` 文件夹的《方案文档-微信公众号抓取通用方案》（TypeScript 化融入，原文留档见 `docs/research/2026-08-12-wechat-monitor-方案留档.md`）
>
> 产品界面：Codex / Claude Code 等本地 Agent（不变）

## Problem Statement（问题陈述）

`wechat-notebank` v0.2.0 只能按用户提供的 URL 归档文章，存在三个与「防止内容失传」使命相悖的缺口：

1. **无法按公众号名发现文章**。用户想保存某位博主最近或往期的文章时，必须自己在微信里逐篇找链接，Agent 帮不上忙。
2. **图片没有本地化**。归档文件里保留 `mmbiz.qpic.cn` 远程地址，微信防盗链且文章删除后图片失效，L1 原文会逐渐变成缺图残本。
3. **正文不是真 Markdown**。`saveArticle` 直接把清理后的 HTML 写进 `.md` 壳（`src/lib/storage.ts`），与 Skill 对外承诺的 "convert WeChat articles to Markdown" 不符，也不利于 L2-L4 加工时引用原文。

外部方案（Python 单文件脚本）已验证了搜狗微信搜索的反爬绕过、今天看啥镜像站的历史列表、防盗链图片下载三条技术路线，但它是 Python 实现、目录式输出，不能直接进入本仓库。需要按仓库调性（TypeScript、扁平 L1、CLI/Skill 分层、确定性事务）重新落地。

## Solution（解决方案）

保持「CLI 负责确定性事实与文件事务，Agent 负责语义理解与编排」的边界，v0.3.0 增加三组能力：

1. **`search` 命令（只读文章发现，双数据源）**：输入公众号名（搜狗，最近文章）或今天看啥专栏 URL（镜像，完整历史列表），输出可直接交给 `fetch` 的 `mp.weixin.qq.com` 直链列表。CLI 不做「搜完自动归档」；搜索 → 用户挑选 → 逐条归档的编排放在 Skill 层新增的 discover 路由。
2. **图片本地化（默认开启）**：归档事务内把正文图片下载到与 `.md` 同名的 `.assets` 目录，正文引用改为相对路径；单图失败保留远程地址，绝不因图片失败整篇归档失败。
3. **正文转真 Markdown**：图片本地化之后、落盘之前，用成熟转换库把清理后的 HTML 转为 Markdown。只影响新归档，存量文件不迁移。

三组能力同一个 v0.3.0 发布：图片本地化与 Markdown 转换若分版本发布，知识库会出现三代正文格式并存（HTML+远程图 → HTML+本地图 → Markdown+本地图），一次到位只留两代。

## User Stories（用户故事）

1. 作为用户，我希望告诉 Agent 一个公众号名就能看到它最近的文章列表，以便不用自己去微信里找链接。
2. 作为用户，我希望贴一个今天看啥专栏链接就能拿到某个博主的完整历史文章列表，以便把往期内容一并归档。
3. 作为用户，我希望搜索结果里混入的其他公众号文章能被精确过滤，以便列表只包含目标博主。
4. 作为 Agent，我希望 `search --json` 返回结构化的标题、公众号、日期和微信直链，以便逐条交给 `fetch` 归档。
5. 作为 Agent，我希望搜狗触发验证码时得到结构化错误而不是崩溃或静默空结果，以便如实告知用户稍后重试或换数据源。
6. 作为 Agent，我希望中途触发验证码时已解析的条目不丢失，以便部分结果仍可继续归档。
7. 作为用户，我希望归档时正文图片下载到本地并改为相对引用，以便原文在微信删除后依然完整可读。
8. 作为用户，我希望个别图片下载失败时保留远程地址且归档照常完成，以便不因一张图丢掉整篇文章。
9. 作为用户，我希望新归档的正文是真 Markdown，以便在 Obsidian 里正常阅读、编辑和被 L2-L4 加工引用。
10. 作为已有用户，我希望存量归档文件保持原样，以便升级不改写我的知识库。
11. 作为谨慎的用户，我希望所有发现行为内置节流、检测到反爬立即停止且从不绕过验证码，以便工具不会把我的网络环境拖进风控。
12. 作为维护者，我希望发现能力与归档主线解耦，以便某个数据源失效或越线时可以单独下线，不影响按 URL 归档。

## Implementation Decisions（实施决策）

### `search` 命令与数据源

命令形态：

```bash
alskai-notebank search "<公众号名或专栏URL>" [--source sogou|mirror] [--limit N] [--account <精确过滤>] [--json]
```

- 输入含 `jintiankansha.me` 域名时自动路由 mirror；否则默认 sogou。`--source` 显式覆盖。
- **sogou 源（最近文章）**：Puppeteer 复用 `src/lib/parser.ts` 的浏览器启动配置（channel:chrome / `WECHAT_NOTEBANK_CHROME_PATH` / 沙箱策略 / UA）。真浏览器先访问搜狗首页天然落 SNUID cookie；结果页解析 `li[id^='sogou_vr_11002601_box']`（`h3 a` 标题与 link、`.all-time-y2` 公众号名、`.s2` 内 `timeConvert('unix_ts')` 日期）；逐条导航 link 页，搜狗的 JS 拆链拼接由浏览器自动执行，轮询 `page.url()` 直到出现 `mp.weixin.qq.com` 前缀（≤10s，测试可用 `WECHAT_NOTEBANK_SEARCH_RESOLVE_TIMEOUT_MS` 调低）即得直链。`--limit` 1–10（搜狗单页 10 条，不翻页），缺省 10。
- **mirror 源（完整历史列表）**：主路径是用户直接提供专栏 URL（`https://www.jintiankansha.me/column/<id>`）；给关键词时用搜狗 `site:jintiankansha.me <关键词>` 查找专栏页作为便利路径，失败时结构化提示引导用户贴专栏 URL。专栏页与 `/t/` 文章页用 Node 20 global fetch + cheerio 解析（无需浏览器）；专栏页翻页跟随直到 `--limit` 或无下一页；每个列表项访问 `/t/` 页提取 `mp.weixin.qq.com` 原文直链，提取不到标 `resolved:false`。2026-08-15 对真实专栏第 1 页 13 篇样本的验证结果为 **0/13**：`/t/` 页均无微信直链，原文入口统一位于 `/t_original/<id>`，但该路径会 302 到 `/account/signin` 登录墙。安全底线禁止登录或绕过，因此不访问该路径，`resolved:false, sourceUrl:null` 是预期降级结果。`--limit` 上限 100，缺省 100。专栏列表不提供公众号名与发布日期，mirror 源条目的 `account` / `pubDate` 恒为 `null`。
- **节流与数据源失败语义**：两源逐条解析、mirror 翻页之间间隔 ≥3 秒（`WECHAT_NOTEBANK_SEARCH_INTERVAL_MS`，默认 3000，仅供测试调低）。`antispider` URL 以及 `VerifyCode` / `seccode` / 验证码 HTML 文本标记是 **sogou 专用判据**：列表页命中 → `SOGOU_CAPTCHA` 失败；逐条解析中途命中 → `status:"partial"` 保留已解析条目，且均立即停止、不重试。mirror 不复用该文本判据（真实站全站模板含 `linkbuxverifycode` SEO 验证 meta，会造成误报），专栏页改由 HTTP 状态与 `/t/` 列表骨架共同判断可用性：请求失败、非 2xx 或骨架无法识别 → `SEARCH_UNAVAILABLE`；单篇 `/t/` 页非 2xx 或无微信直链只标 `resolved:false`，不中断整批。
- **输出安全闸**：每个输出 URL 必须通过 `assertSafeArticleUrl`（`src/lib/url.ts`，通用 SSRF 防护）**加** `mp.weixin.qq.com` host 白名单双闸；专栏 URL 另设 `jintiankansha.me` host 白名单。未解析成功的条目输出 `resolved:false, sourceUrl:null`——搜狗 rawLink 绑定会话几分钟内过期、镜像 `/t/` 链接无归档价值，都不落 JSON。
- 空结果不是错误：返回 `ok:true, items:[]`。`SEARCH_UNAVAILABLE` 保留给「页面骨架无法识别」（DOM 变更 / 站点不可达），与「真没搜到」严格区分，避免静默空结果。

### `search --json` 契约

成功（空结果同形，`items: []`；mirror 源额外带 `columnUrl`）：

```json
{ "ok": true, "command": "search", "status": "completed",
  "result": { "query": "饼干哥哥AGI", "source": "sogou", "account": null,
    "limit": 10, "intervalMs": 3000,
    "items": [
      { "title": "…", "account": "饼干哥哥AGI", "pubDate": "2026-08-01",
        "sourceUrl": "https://mp.weixin.qq.com/s/xxx", "resolved": true },
      { "title": "…", "account": "饼干哥哥AGI", "pubDate": "2026-07-30",
        "sourceUrl": null, "resolved": false } ] } }
```

列表页即验证码：

```json
{ "ok": false, "command": "search", "status": "failed",
  "error": { "code": "SOGOU_CAPTCHA", "message": "…" } }
```

逐条解析中途验证码（已解析条目保留）：

```json
{ "ok": false, "command": "search", "status": "partial",
  "result": { "…": "已解析 items" },
  "error": { "code": "SOGOU_CAPTCHA", "message": "…" } }
```

新错误码（`src/lib/command-error.ts`）：

| 错误码 | 含义 |
|---|---|
| `SOGOU_CAPTCHA` | 搜狗触发验证码或反爬拦截，已立即停止；建议稍后重试、降低频率或改用 mirror / 直接贴链接 |
| `SEARCH_UNAVAILABLE` | 数据源不可达，或页面结构无法识别（DOM 变更）；mirror 专栏页请求失败、非 2xx 或列表骨架无法识别也报此码 |

### 图片本地化

- **接入点**：`archiveArticle`（`src/commands/fetch.ts`），fetch 与 import 单点同时生效（import 复用 `archiveArticle`）。在 `withSourceUrlLock` 锁内、md 落盘之前执行；顺序**先图后文**——`.md` 文件是「已归档」的唯一判据（去重只看 `.md` frontmatter），md 写失败时 best-effort 清理 assets 目录，不留「看似已归档」的半成品；孤儿 assets 无害（重跑时 `imgN` 复写幂等）。
- **目录与命名**：assets 目录名 = 最终 md 文件名（含 `-2`/`-3` 冲突后缀）去掉 `.md` 加 `.assets`，与 md 同层。例：`2026-08-10-标题-2.md` → `2026-08-10-标题-2.assets/img1.jpg`。目录内文件名固定 `imgN.<ext>`（按正文出现顺序编号，不取自 URL，无路径穿越面）；扩展名按 Content-Type 白名单（jpg/png/gif/webp）推断，兜底 URL 的 `wx_fmt` 参数，再兜底 `.jpg`。无图不建目录。`findArticleBySourceUrl` 只扫 `.md` 文件（`extname` + `isFile`），assets 目录不影响去重。
- **下载**：Node 20 global fetch，请求头带 `Referer: https://mp.weixin.qq.com/`（防盗链要求，还原正常浏览语义）与 parser 相同 UA；`redirect: 'manual'` 手动跟随（≤3 跳），**每一跳都过 `assertSafeArticleUrl`**（公网 URL 302 到内网/元数据地址是经典 SSRF）；单图超时 `WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS`（默认 30000）。`data:` URI 跳过；SSRF 拦截、HTTP 非 200、超时均**保留远程 URL、不计整篇失败**。
- **开关**：默认开启；`--no-images`（fetch / import 通用）跳过下载，行为回到 v0.2.0。
- **结果契约**：fetch / import 每个条目的 result **恒定**输出 `"images": { "total": N, "downloaded": M }`（无图输出 `{"total":0,"downloaded":0}`，保证 `deepStrictEqual` 断言稳定）。

### 正文转真 Markdown

- 在图片本地化（HTML 内 `img src` 已改写为相对路径）之后转换，`cleanHtml` 与 parser 逻辑不动。
- 用成熟转换库，**禁止自研递归转换器**——嵌套列表、转义、表格长尾会静默错乱，违背防失传使命。实测二选一已完成（2026-08-15，turndown 7.2.4 vs node-html-markdown 2.0.0，评估维度：嵌套列表、`pre>code` 语言保留、`strong/em` 转义、微信 section 嵌套汤、表格、传递依赖体积）：**选定 node-html-markdown**（`codeBlockStyle: 'fenced'`）——核心维度两者等价，node-html-markdown 原生输出 GFM 表格、自带类型定义、传递依赖约 0.4MB（turndown 链约 8.8MB 且表格需额外插件）。实测记录见 `src/lib/markdown.ts` 头部注释。
- 只影响新归档。存量 HTML 正文不迁移（pack 引用匹配基于文件现有文本，两代格式并存安全；未来有需要再做迁移器）。

### 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `WECHAT_NOTEBANK_SEARCH_INTERVAL_MS` | `3000` | search 逐条解析 / 翻页间隔；仅测试可调低，文档明示不要在真实使用中降低 |
| `WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS` | `30000` | 单张图片下载超时 |
| `WECHAT_NOTEBANK_SEARCH_HEADFUL` | 无 | `=1` 时 search 用有头浏览器（反爬逃生舱） |

测试专用（延续 mock 注入惯例）：`WECHAT_NOTEBANK_TEST_HTML_MAP`（URL→HTML 文件映射）、`WECHAT_NOTEBANK_TEST_REDIRECT_MAP`（URL→跳转目标）、`WECHAT_NOTEBANK_TEST_IMAGE_MAP`（URL→本地图片文件）、`WECHAT_NOTEBANK_SEARCH_RESOLVE_TIMEOUT_MS`（search 逐条直链还原的轮询上限，默认 10000，真实使用不要调低）。

### 安全与合规底线（对齐 CONTEXT.md「公共发布底线」）

本项目公开发布，发现能力必须满足以下每次发布不可妥协的约束：

1. 只读访问公开页面：不登录、不破解、**不绕过验证码**——检测到反爬即停止并结构化报错，绝不重试轰炸。
2. 内置固定节流（≥3s），单命令单浏览器会话；sogou 不翻页（limit ≤10）、mirror limit ≤100。
3. 不提供账号级持续监控或定时采集；CLI 不做「搜完自动归档」，归档由用户在 Skill 对话中逐条确认。
4. 图片下载的 `Referer` 仅还原正常浏览器浏览语义，用于用户个人存档，不重新分发。
5. 发现能力与归档主线解耦：维护者判定某数据源越线时，可单独下线该源（search 子命令级别），不影响按 URL 归档。

搜狗对无头浏览器的识别风险评估为低（外部方案用裸 requests 即可通过，风控主体是 SNUID cookie + 频率）。缓解阶梯按需启用，不预防性引入 stealth 依赖：① launch args 加 `--disable-blink-features=AutomationControlled`；② `WECHAT_NOTEBANK_SEARCH_HEADFUL=1` 有头逃生舱。

### Skill 层（discover 路由）

- 新增 `skills/alskai-notebank/references/discover.md`：发现意图路由。规则要点：最近文章走 sogou、完整历史走 mirror 专栏 URL（含指引用户到 jintiankansha.me 搜索公众号复制专栏地址）；`resolved:false` 条目如实告知用户无法还原；rawLink 会过期，归档必须用返回的直链调用 fetch；**禁止循环调用 search**（一次任务一次搜索，验证码后不自动重试）；mirror 全量扫描是温和长任务，需向用户预告耗时。
- `SKILL.md` 增加 discover 路由行；边界节增加「发现由 CLI 执行，Agent 不得自行抓取搜狗/镜像站」。
- 修订 `references/archive.md` 的 crawler 禁令句：批量直链归档仍禁止 crawler 化，但用户明确的发现意图改道 discover 路由，两处边界互指不矛盾。

### 明确不做（非目标）

- 搜狗翻页（反爬风险翻倍，mirror 已覆盖历史全量场景）与搜狗账号搜索（type=1）。
- 搜完自动归档（编排属 Skill 层，且违反逐条确认底线）。
- 镜像站正文抓取（VIP 墙；mirror 只做列表与直链还原）。
- 存量归档正文迁移。
- doctor 增加数据源连通性检查（保持只读、离线可测定位；将来做 opt-in `--network` 进 backlog）。
- 定时监控、订阅式采集。

### 术语（随 v0.3.0 写入 CONTEXT.md）

- **文章发现**：只读地把公众号名或专栏链接解析为可归档的 `mp.weixin.qq.com` 直链列表的能力；不抓正文、不写知识库、不自动归档。_Avoid_: 爬虫、批量采集
- **发现数据源**：`search` 用于获得文章列表的外部公开站点通道（搜狗微信搜索、今天看啥镜像站），每个通道有独立的节流与失败语义，可单独下线。_Avoid_: 官方接口、API
- **图片本地化**：归档事务内把正文远程图片下载到与原文同名的 `.assets` 目录并改写为相对引用，单图失败保留远程地址。_Avoid_: 图床、转存上传

## 验收基线

1. `npm run build && npm test` 全绿（既有 39 个测试 + 新增测试，全部离线运行）。
2. 真实网络手工验证（不进自动化）：带图文章归档后 `.assets/` 落盘、md 内相对路径、Obsidian 渲染正常；`search "饼干哥哥AGI" --limit 3 --json` 返回直链列表；mirror 用真实专栏 `https://www.jintiankansha.me/column/FDo3tWhjrh` 验证历史列表、翻页与直链还原率，还原率如实回写本 spec。
3. 触发验证码场景得到结构化 `SOGOU_CAPTCHA` 而非崩溃（对应外部方案验证清单第 7 条）。
4. `npm run release:pack` 幂等（两次打包 SHA-256 一致）。
