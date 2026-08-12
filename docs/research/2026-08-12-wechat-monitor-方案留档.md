# 外部方案留档：微信公众号抓取通用方案（wechat-monitor）

> 用途：本文件是 v0.3.0「文章发现与图片本地化」能力的来源留档。原方案是一套独立于本仓库的 Python 单文件工具，已被吸收进 TypeScript 实现，脚本本身不入库（TS 仓库保留 Python 死代码只会造成困惑）。设计取舍见 `docs/superpowers/specs/2026-08-12-wechat-discovery-and-image-localization-spec.md`。
>
> 来源：用户飞书云盘文件夹 `wechat-monitor-公众号抓取`（folder token `GaAYfusizlCKJPdItb6c06Odnjg`），含《方案文档-微信公众号抓取通用方案.md》《AI提示词包-公众号抓取.md》《README-wechat-monitor.md》`wechat_fetch.py``requirements.txt`。
>
> 留档日期：2026-08-12

## 一、原方案能力总览

Python 3.8+ 单文件脚本 `wechat_fetch.py`，自包含（首次运行自动 pip 装依赖 `requests`/`beautifulsoup4`/`lxml`/`rich`），`--doctor` 自检。三种数据源：

| 数据源 | 能拿列表 | 能抓正文 | 反爬难度 | 定位 |
|---|---|---|---|---|
| 搜狗微信搜索（weixin.sogou.com） | 按关键词搜文章 | 能解析出微信直链 | 高 | 默认首选，输入公众号名即可 |
| 粘贴链接（mp.weixin.qq.com/s/xxx） | — | 直接抓 | 低 | 最稳定，兜底 |
| 今天看啥镜像站（jintiankansha.me） | 专栏页完整列表 | 正文需 VIP | 低 | 快速看「这个号发了什么」 |

输出结构（本仓库不采用，改用现有扁平 L1 布局）：`<存储根>/<公众号名>/<YYYY-MM-DD>-<标题>/README.md + images/`。

## 二、关键技术难点与解决方案（原方案踩坑记录）

### 2.1 搜狗反爬三个坎

**坎 1：antispider 302 拦截。** 直接请求搜狗 link 链接会被 302 到 `/antispider/` 验证页。解法：先用同一 Session GET 搜狗首页拿 SNUID cookie，再带 `Referer: https://weixin.sogou.com/` 请求。

**坎 2：真实链接被 JS 拆散。** 搜狗 link 页不直接给微信 URL，而是拆成 `url += 'xxx'` 片段由 JS 拼接后 `window.location.replace` 跳转。Python 解法是正则 `re.findall(r"url\s*\+=\s*'([^']*)'", html)` 拼接还原。

> 本仓库的 TS 实现改用 Puppeteer 真浏览器：JS 拆链由浏览器自动执行，跳转后轮询 `page.url()` 直接拿到直链，绕过正则拼接 hack。

**坎 3：高频请求触发验证码。** 列表项之间请求间隔 ≥3 秒；复用同一 Session；检测到 `VerifyCode`/`验证码`/`antispider`/`seccode` 关键词即停止重试，提示用户等待或换源。

### 2.2 搜狗列表页解析

结果块 `<li id="sogou_vr_11002601_box_0">`：标题 `h3 a`；公众号名 `.all-time-y2`；日期 `.s2` 内 `timeConvert('unix_ts')`（转 `%Y-%m-%d`）。

### 2.3 微信文章页解析

| 字段 | 选择器 |
|---|---|
| 标题 | `h1#activity-name` 或 `meta[property="og:title"]` |
| 公众号 | `a#js_name` 或 `meta[property="og:article:author"]` |
| 作者 | `em#js_author_name` |
| 正文 | `div#js_content` |
| 日期 | `em#publish_time`；兜底页面 JSON 里 `publish_time":<unix>`（可能 URL 编码为 `publish_time%22%3A`） |

> 本仓库 `src/lib/parser.ts` 已实现等价解析（选择器略有差异，以现有代码为准）。

### 2.4 图片抓取（防盗链与懒加载）

两个坑：懒加载图在 `data-src` 而非 `src`；直接下载 `mmbiz.qpic.cn` 会 403，必须带 `Referer: https://mp.weixin.qq.com/`。

```python
src = img.get("data-src") or img.get("src")
resp = requests.get(src, headers={"User-Agent": UA, "Referer": "https://mp.weixin.qq.com/"})
```

> 这正是本仓库 v0.2.0 缺失、v0.3.0「图片本地化」要补齐的核心。TS 实现额外加了逐跳 SSRF 校验、Content-Type 扩展名推断、单图失败保留远程 URL 兜底。

### 2.5 正文 HTML→Markdown

原方案用 BeautifulSoup 递归转换（p/div/section→段落、hN→#、ul/ol/li→列表、pre/code→代码块、strong/em→粗斜体、img→占位后替换本地路径）。

> 本仓库改用成熟转换库（turndown / node-html-markdown 二选一），不自研递归转换器——嵌套列表 / 转义 / 表格长尾容易静默错乱。

### 2.6 今天看啥镜像站

专栏页（`jintiankansha.me/column/<id>`）公开可访问，`a[href*='/t/']` 拿完整文章列表；正文需登录 VIP，只适合看列表。站内搜索需登录，脚本用搜狗 `site:jintiankansha.me <公众号名>` 找专栏页。

## 三、原方案验证清单（部署后必测）

1. `--doctor` → 依赖 ✓ 网络 ✓
2. 搜狗列表 `--list-only` → 有列表、日期正确
3. 公众号过滤 `--account "精确名"` → 混入的其他号被剔除
4. 抓全文 `--index 1` → README.md + images/ 生成，图片数量 > 0
5. 粘贴链接 `--url` → 直接抓取成功
6. 增量去重：重复运行 → 提示「已存在，跳过」
7. 验证码场景：连续搜 3 次 → 友好提示而非崩溃

> 本仓库把第 2/3/5 条映射到 `search` + `fetch` 的手工验证，第 6 条已由现有 `sourceUrl` 去重覆盖，第 7 条映射到 `SOGOU_CAPTCHA` 结构化错误。

## 四、合规评估（对齐 CONTEXT.md「公共发布底线」）

本仓库是公开发布项目，把上述抓取能力产品化必须守住的底线（详见 spec「安全与合规底线」节）：

1. **只读、不绕过验证码**：检测到反爬立即停止并结构化报错，绝不重试轰炸或接入打码服务。
2. **内置节流**：固定 ≥3s 间隔，搜狗不翻页（limit ≤10）、镜像 limit ≤100，单命令单会话。
3. **无账号级持续监控**：不做定时采集 / 订阅；CLI 不自动归档，逐条由用户在 Skill 对话中确认。
4. **图片下载的 Referer 仅还原正常浏览语义**，用于用户个人存档，不重新分发。
5. **数据源可单独下线**：发现能力与按 URL 归档主线解耦，维护者判定某数据源越线时可在 search 子命令级别摘除，不影响归档。

镜像站正文需 VIP，本仓库只做列表与直链还原、不碰其正文，规避 VIP 内容抓取争议。搜狗对无头浏览器识别风险评估为低，缓解阶梯（`--disable-blink-features=AutomationControlled` → 有头逃生舱）按需启用，不预防性引入 stealth 依赖。
