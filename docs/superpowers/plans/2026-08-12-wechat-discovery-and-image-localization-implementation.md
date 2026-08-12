# 文章发现与图片本地化实施计划（v0.3.0）

> **For agentic workers:** 每个 Task 独立执行、独立验收。执行前先读规格文档 `docs/superpowers/specs/2026-08-12-wechat-discovery-and-image-localization-spec.md`（本文简称「spec」），所有 JSON 契约、错误码、环境变量、安全约束以 spec 为准。提交由维护者在阶段验收后完成，执行者不 commit、不推送、不改版本号（T12 除外）。

**Goal:** 让 wechat-notebank 具备「按公众号名发现最近文章（搜狗）+ 按专栏 URL 发现完整历史文章（今天看啥镜像）+ 归档时图片本地化 + 正文真 Markdown」，同一个 v0.3.0 发布。

**Architecture:** CLI 新增只读 `search` 命令（双数据源，输出 mp.weixin.qq.com 直链列表）；`archiveArticle` 事务内插入「图片本地化 → Markdown 转换」两级流水；Skill 新增 discover 路由承担搜索→挑选→逐条归档的编排。扁平 L1 布局、sourceUrl 去重、锁、pack 流程全部不动。

**Tech Stack:** TypeScript、puppeteer-core（已有）、cheerio（已有）、Node 20 global fetch、成熟 HTML→Markdown 库（T9 二选一）、纯 Node assert 测试 + mock 注入。

---

## 执行者必读：既有代码事实

这些事实已核实，违反任何一条都会翻车：

1. **测试是显式串联**：`package.json` 的 `test` script 用 `&&` 逐个列出测试文件。新增测试必须追加到该串联，否则永远不会被执行。
2. **全量 JSON 断言**：`tests/fetch-json.test.js` 与 `tests/import-json.test.js` 用 `assert.deepStrictEqual` 对整个 result 断言。给 result 增加字段（如 `images`）必须在同一个 Task 里更新这些断言，且新字段要**恒定输出**（无图输出 `{"total":0,"downloaded":0}`）。
3. **`assertSafeArticleUrl`（`src/lib/url.ts`）是通用 SSRF 防护，不限定微信域**。search 输出直链需要额外的 `mp.weixin.qq.com` host 白名单；图片下载直接复用它做每跳校验。
4. **`import` 复用 `archiveArticle`**（`src/commands/import.ts`）：图片本地化在 `archiveArticle` 单点接入即可同时生效。
5. **`findArticleBySourceUrl`（`src/lib/storage.ts`）只扫 `.md` 且 `stat.isFile()`**：新增 `.assets` 目录不影响去重，不要为此改动它。
6. **mock 注入惯例**：测试通过 `NODE_OPTIONS=--require=tests/helpers/mock-puppeteer.js` + 环境变量注入假浏览器，测试进程 spawnSync 调 `dist/index.js`。新 mock 遵循同一模式。
7. **references 清单被硬编码**在 `tests/skill-routing.test.js` 与 `tests/release-package.test.js`：新增 `discover.md` 必须同步这两处。
8. **命令路由是 `src/index.ts` 的 if-else 链**：新命令照抄现有分支结构（`parseXxxArgs` + `writeJsonOutput` + `writeCommandJsonFailure`），参数解析加在 `src/lib/cli.ts`。
9. **puppeteer-core 24 的 `headless: true` 已是新 headless**，不要写 `headless: 'new'`。
10. **中文注释、中文错误消息**，与现有代码一致；不引入测试框架、不引入未在 spec 批准的依赖。

每个 Task 的统一验收前置：`npm run build && npm test` 全绿（离线，不访问真实网络）。

---

## P1 图片本地化

### Task 1（T1）：storage 两步化重构

**Files:**
- Modify: `src/lib/storage.ts`

- [ ] 把 `saveArticle` 内部拆成两个导出函数：`reserveArticleFilePath(archivePath, title, pubDate)`（组合 `generateFilename` + `getAvailableFilePath`，返回最终含冲突后缀的绝对路径）和 `writeArticleFile(filePath, content, meta)`（`matter.stringify` + 写盘）。
- [ ] `saveArticle` 变为两者组合，签名与行为完全不变。

**验收：** 现有测试零改动全绿（纯重构）。
**依赖：** 无。

### Task 2（T2）：images 模块与单测

**Files:**
- Create: `src/lib/images.ts`
- Create: `tests/image-localization.test.js`
- Modify: `package.json`（test 串联追加）

- [ ] 实现 `localizeImages(contentHtml, assetsDirAbsPath, assetsDirName): Promise<{ content: string; total: number; downloaded: number }>`：cheerio 遍历 `img[src]`；`data:` URI 跳过（不计入 total）；每个 URL 过 `assertSafeArticleUrl`，拦截则保留远程 URL；global fetch 下载，请求头 `Referer: https://mp.weixin.qq.com/` + 与 `src/lib/parser.ts` 相同 UA；`redirect:'manual'` 手动跟随 ≤3 跳、每跳重新过 `assertSafeArticleUrl`；单图 `AbortSignal.timeout(WECHAT_NOTEBANK_IMAGE_TIMEOUT_MS 默认 30000)`；扩展名 Content-Type 白名单（jpeg/png/gif/webp）→ URL `wx_fmt` 参数 → `.jpg` 兜底；落盘 `imgN.<ext>`（按出现顺序编号）；成功则把该 img 的 src 改写为 `./<assetsDirName>/imgN.<ext>`，失败保留远程 URL；无成功下载不留空目录。
- [ ] 单测（进程内 require `dist/lib/images.js`，monkeypatch `globalThis.fetch` 返回构造的 Response，**不要起本地 http server**——`127.0.0.1` 会被自家 SSRF 防护拦截）：成功下载与 src 改写；单图 403 / 超时保留远程；SSRF URL 保留远程且断言 fetch 未被调用；302 到内网地址被拦；Content-Type 与 `wx_fmt` 的扩展名推断；`data:` URI 跳过；无图不建目录。

**验收：** 单测全过且不触网。
**依赖：** 无（与 T1 并行）。

### Task 3（T3）：归档接入、JSON 契约与 `--no-images`

**Files:**
- Modify: `src/commands/fetch.ts`、`src/lib/cli.ts`、`src/index.ts`、`src/commands/import.ts`、`src/lib/importer.ts`
- Create: `tests/helpers/mock-fetch.js`、`tests/fetch-images.test.js`、`tests/fixtures/wechat-article-with-images.html`
- Modify: `tests/fetch-json.test.js`、`tests/import-json.test.js`（deepStrictEqual 补 `images` 字段；如 `tests/agent-workflow.test.js` 断言 result 全量，一并核对）
- Modify: `package.json`（test 串联追加）

- [ ] `archiveArticle` 串联：`reserveArticleFilePath` → `localizeImages`（除非 `--no-images`）→ `writeArticleFile`；md 写失败 best-effort `fs.remove(assetsDir)`。
- [ ] fetch / import 增加 `--no-images` 参数；fetch result 与 import 每个 item 恒定输出 `images: { total, downloaded }`。
- [ ] `tests/helpers/mock-fetch.js`：`--require` 注入覆写 `globalThis.fetch`，读 `WECHAT_NOTEBANK_TEST_IMAGE_MAP`（JSON：URL→本地图片文件路径），miss 返回 403。
- [ ] fixture：`#js_content` 含懒加载 `data-src` 图、普通 `src` 图、`data:` URI 各至少一张。
- [ ] e2e 断言：`.assets` 目录内容、md 内相对路径、`result.images` 数值、部分失败仍 `status:"saved"` 且 exit 0、`--no-images` 下无目录且 `images:{total:N,downloaded:0}`（total 仍统计）——total 语义以 spec 为准：`--no-images` 时跳过下载，`images` 输出 `{"total":0,"downloaded":0}`。

**验收：** 全量测试绿；`--no-images` 行为与 v0.2.0 落盘字节级一致。
**依赖：** T1、T2。

---

## P2 search 发现（双数据源）

### Task 4（T4）：mock-puppeteer 扩展

**Files:**
- Modify: `tests/helpers/mock-puppeteer.js`

- [ ] 新增 `WECHAT_NOTEBANK_TEST_HTML_MAP`（JSON：URL→HTML 文件路径；`content()` 先按当前 URL 全等再前缀匹配，miss 回落现有 `WECHAT_NOTEBANK_TEST_HTML_FILE`）。
- [ ] 新增 `WECHAT_NOTEBANK_TEST_REDIRECT_MAP`（JSON：from→to；`goto(from)` 后当前 URL 变为 to，模拟搜狗 link 页 JS 跳转）。
- [ ] 新增 `page.url()` 返回当前 URL。现有 `TEST_FAIL_URL` / `TEST_GOTO_DELAY_MS` 语义不动。

**验收：** 现有测试零改动全绿（新能力由 T7 的 e2e 实证）。
**依赖：** 无。

### Task 5（T5）：sogou 纯解析模块

**Files:**
- Create: `src/lib/sogou.ts`、`tests/sogou-parser.test.js`
- Create: `tests/fixtures/sogou-search-results.html`（3 个结果块，其中 1 条属于其他公众号供 `--account` 过滤断言）、`tests/fixtures/sogou-antispider.html`
- Modify: `package.json`

- [ ] `parseSogouResults(html)`：按 spec 选择器解析标题 / rawLink（`/link` 相对路径绝对化）/ 公众号名 / `timeConvert` 日期（unix→`YYYY-MM-DD`，Asia/Shanghai）。
- [ ] `detectAntispider(url, html)`：URL 含 `/antispider/` 或内容含 `VerifyCode`/`验证码`/`seccode` 标记。
- [ ] 结果页骨架检测：能区分「有骨架无条目」（正常空结果）与「骨架不存在」（DOM 变更 → `SEARCH_UNAVAILABLE` 的判据）。

**验收：** 纯函数单测全过。
**依赖：** 无。

### Task 6（T6）：mirror 纯解析模块

**Files:**
- Create: `src/lib/mirror.ts`、`tests/mirror-parser.test.js`
- Create: `tests/fixtures/mirror-column-page1.html`（含下一页链接）、`tests/fixtures/mirror-column-page2.html`（无下一页）、`tests/fixtures/mirror-article-page.html`（含 mp.weixin.qq.com 原文链接）
- Modify: `package.json`

- [ ] `parseColumnPage(html, baseUrl)`：提取 `a[href*='/t/']` 列表项（标题去重、绝对化，标题 <5 字符跳过）与下一页链接（分页 DOM 先按常见形态实现并在 fixture 固化；真实结构以发布前手工验证回校）。
- [ ] `extractWeixinUrl(html)`：从 `/t/` 文章页正则提取 `mp.weixin.qq.com/s` 直链，取不到返回 null。
- [ ] 专栏 URL 校验：host 必须是 `jintiankansha.me` / `www.jintiankansha.me` 且路径 `/column/`。

**验收：** 纯函数单测全过（单页 / 多页 / 无直链三种 fixture）。
**依赖：** 无。

### Task 7（T7）：search 命令（双源编排）

**Files:**
- Create: `src/commands/search.ts`、`tests/search-json.test.js`
- Modify: `src/lib/cli.ts`（`parseSearchArgs`：位置参数必填；`--source sogou|mirror`；`--limit` sogou 1–10 / mirror 1–100；`--account`；`--json`）、`src/index.ts`（路由 + help 文本）、`src/lib/command-error.ts`（`SOGOU_CAPTCHA`、`SEARCH_UNAVAILABLE`）、`src/lib/parser.ts`（把 launch 配置构造提取为导出函数，抓取逻辑不动）
- Modify: `package.json`

- [ ] 源路由：输入 host 为 jintiankansha.me → mirror；`--source` 显式覆盖；默认 sogou。
- [ ] sogou 流程（Puppeteer，复用导出的 launch 配置；单命令单浏览器会话）：goto 搜狗首页（落 cookie）→ goto 搜索页 → `detectAntispider`（命中 → `SOGOU_CAPTCHA` failed）→ `parseSogouResults` → 骨架缺失 → `SEARCH_UNAVAILABLE`；有骨架无条目 → `ok:true items:[]` → `--account` 过滤 + limit 截断 → 逐条：sleep（`WECHAT_NOTEBANK_SEARCH_INTERVAL_MS` 默认 3000）→ goto(rawLink) → 轮询 `page.url()` 至 `mp.weixin.qq.com` 前缀（≤10s）→ 双闸校验（`assertSafeArticleUrl` + host 全等 `mp.weixin.qq.com`）→ `resolved:true`；超时/非微信域 → `resolved:false, sourceUrl:null`；中途验证码 → `status:"partial"` 保留已解析条目。
- [ ] mirror 流程（global fetch + cheerio，走 mock-fetch 测试）：关键词输入时先用 sogou 会话搜 `site:jintiankansha.me <关键词>` 找专栏 URL（失败给结构化提示引导贴 URL）；专栏 URL 输入时直接开始：翻页跟随（页间 sleep 同上）→ 累计到 limit → 逐条 `/t/` 页还原直链（条间 sleep 同上）→ 同一双闸校验；result 带 `columnUrl`。
- [ ] `--json` 信封与 spec 契约逐字段一致（含 `source`、`intervalMs`、`resolved`、`sourceUrl:null` 语义）；进度写 stderr。
- [ ] launch args 增加 `--disable-blink-features=AutomationControlled`；`WECHAT_NOTEBANK_SEARCH_HEADFUL=1` 时 `headless:false`。
- [ ] e2e 用例：sogou completed / 空结果 / `--account` 过滤 / limit 边界（0、11 → CLI_USAGE_ERROR）/ 列表页 SOGOU_CAPTCHA / 中途 partial / resolved:false / mirror 单页 / mirror 翻页 / mirror 直链还原失败 / 未知参数 CLI_USAGE_ERROR。

**验收：** `tests/search-json.test.js` 全过；全量测试绿。
**依赖：** T4、T5、T6。

### Task 8（T8）：Skill discover 路由

**Files:**
- Create: `skills/alskai-notebank/references/discover.md`
- Modify: `skills/alskai-notebank/SKILL.md`、`skills/alskai-notebank/references/archive.md`
- Modify: `tests/skill-routing.test.js`、`tests/release-package.test.js`

- [ ] `discover.md`（英文，风格对齐现有 references）：路由条件（用户想找某公众号发过什么 / 最近文章 / 往期历史）；选源规则（最近 → sogou 关键词；完整历史 → mirror 专栏 URL，附「到 jintiankansha.me 搜公众号名复制专栏地址」指引）；执行规则（永远 `--json`；一次任务一次 search，**验证码后禁止自动重试**，如实告知用户等待或换源；归档必须用返回的 `sourceUrl` 直链逐条调 fetch——rawLink 会过期；`resolved:false` 条目如实报告无法还原；mirror 全量是温和长任务，先向用户预告条数与耗时）；边界（不自行抓取搜狗/镜像站、不做订阅式监控）。
- [ ] `SKILL.md`：新增 discover 路由行；boundaries 增加「发现由 CLI 执行」。
- [ ] `archive.md`：修订 "Do not turn this into a crawler or account-level collection job." —— 批量直链归档禁令保留，用户明确的发现意图指向 discover 路由，两处互指不矛盾。
- [ ] 同步两个硬编码清单测试。

**验收：** `skill-routing` 与 `release-package` 测试绿；discover 与 archive 边界句互不矛盾。
**依赖：** T7。

---

## P3 Markdown 转换（与 P1 同版本发布）

### Task 9（T9）：markdown 模块与单测

**Files:**
- Create: `src/lib/markdown.ts`、`tests/markdown-converter.test.js`、`tests/fixtures/wechat-section-soup.html`
- Modify: `package.json`（依赖 + test 串联）

- [ ] 在 turndown 与 node-html-markdown 之间实测二选一（评估：嵌套列表、`pre>code` 的 `language-*` class 保留为围栏语言、strong/em 转义正确性、微信 section 嵌套汤的段落划分、传递依赖体积），把选择理由写进模块头注释。
- [ ] 导出 `convertArticleHtmlToMarkdown(html): string`；对微信特例做预处理（如 `section` 视为块级、多余包裹层拍平），保证 `cleanHtml` 输出的代码块（`pre>code.language-*`）转成带语言的围栏代码块。
- [ ] 单测覆盖：p/h1-h6/嵌套 ul-ol/pre>code 语言/strong/em/a/img（相对路径保留）/blockquote/section 汤 fixture。

**验收：** 单测全过。
**依赖：** 无。

### Task 10（T10）：Markdown 归档接入

**Files:**
- Modify: `src/commands/fetch.ts`（`localizeImages` 之后 `convertArticleHtmlToMarkdown`，再 `writeArticleFile`）
- Modify: 受影响的 e2e 断言（`tests/fetch-json.test.js`、`tests/fetch-images.test.js`、`tests/fetch-html.test.js` 等按实际失败清单更新）

- [ ] 接入转换；`cleanHtml`、`parser.test.js`、`storage.test.js` 不动。
- [ ] 断言新归档正文为真 Markdown（无残留块级 HTML 标签）、图片为 `![](./xxx.assets/imgN.ext)` 语法。

**验收：** 全量测试绿。
**依赖：** T9、T3。

---

## P4 收尾

### Task 11（T11）：术语与文档回写

**Files:**
- Modify: `CONTEXT.md`
- Modify（如实现与文档有偏差）: spec 与 `docs/research/2026-08-12-wechat-monitor-方案留档.md`

- [ ] CONTEXT.md 追加 spec「术语」节的三条定义（文章发现 / 发现数据源 / 图片本地化），格式对齐现有条目（定义 + `_Avoid_`）。
- [ ] 核对实现与 spec 的偏差（字段名、默认值、错误码），有出入以实现为准回写 spec。

**验收：** 术语与实现一致；`release-docs.test.js` 绿。
**依赖：** 可与 P1–P3 并行，偏差回写在最后。

### Task 12（T12）：v0.3.0 版本与发布文档

**Files:**
- Modify: `package.json`（version 0.3.0）、`package-lock.json`、`README.md`、`RELEASING.md`

- [ ] README：新增 search 用法（sogou / mirror 双源示例）、图片本地化与 Markdown 正文说明、`--no-images`、新环境变量；安装 URL 从 v0.2.0 硬编码升到 v0.3.0（README 与 package.json 版本一致是 `release-docs.test.js` 的断言前提）。
- [ ] RELEASING.md：v0.3.0 发布前提段（含真实网络手工验证清单：带图归档、sogou 搜索、mirror 专栏，见 spec 验收基线）。

**验收：** 四个 release-*.test 全绿；`npm run release:pack` 两次打包 SHA-256 一致。
**依赖：** 其余全部 Task。
