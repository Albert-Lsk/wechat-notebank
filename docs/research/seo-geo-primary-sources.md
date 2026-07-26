# wechat-notebank SEO 与 GEO 一手来源调研

> 调研日期：2026-07-26 · 研究对象：`Albert-Lsk/wechat-notebank`，微信公众号文章本地归档、Markdown 与 Obsidian / Logseq 知识库工具 · 资料范围：GitHub、Google、Microsoft Bing、OpenAI、Anthropic、Perplexity 的官方文档与项目当前公开页面

## 结论摘要

GitHub About 应该中文化，但不建议改成纯中文。推荐使用“中文主任务 + 英文短句”的双语 Description：

```text
微信公众号文章转 Markdown：本地归档到 Obsidian、Logseq 和个人知识库 | Archive WeChat articles as local Markdown.
```

理由很直接：GitHub 默认仓库搜索只检索仓库名称、Description 和 Topics；README 只有在用户显式使用 `in:readme` 时才参与。当前中文价值主张虽然已经进入 README，却没有进入 GitHub 默认搜索最重要的三个字段之一。[GitHub 官方搜索文档](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories#search-by-repository-name-description-or-contents-of-the-readme-file)

Topics 应继续使用英文，不需要强行中文化。GitHub 规定 Topic 只能使用小写字母、数字和连字符，最多 20 个；它们本来就适合承担跨语言、机器可检索的分类职责。[GitHub Topics 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

本项目目前已经完成了第一轮仓库内 SEO：中文优先的 README 首屏、英文摘要、结果导向的 `package.json` description 和一组覆盖面较好的 Topics。下一轮最值得做的事情是：

1. 把 GitHub About 改成中英双语。
2. 统一 `wechat-notebank`、`alskai-notebank` 和中文展示名之间的实体关系。
3. 精简 README 的首要叙事，并把安装、使用、隐私、兼容性等深层内容逐步拆到独立文档。
4. 在确实要获取 GitHub 站外流量时，再建设一个可控制标题、语言版本、robots、sitemap、结构化数据与分析工具的轻量官网或文档站。

GEO 不应被当作一套与 SEO 分离的“投喂大模型技巧”。目前有官方证据支持的动作主要是：允许搜索爬虫访问、让重要信息以清晰文本呈现、建立可抓取的链接结构、提供真实而有独特价值的内容、保持信息准确与新鲜，并测量实际引用和引荐。Google 明确表示，AI 搜索不需要额外技术要求、特殊 schema、AI 文本文件或特殊优化；其 2026 年指南进一步点名可忽略 `llms.txt`、人为“分块”和不真实提及等 AEO/GEO 捷径。[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)；[Google 生成式 AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

## 当前状态判断

### 已经做对的部分

- 当前 README 第一屏先用中文说明“微信公众号文章转本地 Markdown”，随后给出英文摘要，主用户与国际开发者都能快速理解。[当前公开仓库](https://github.com/Albert-Lsk/wechat-notebank)
- README 已自然包含微信公众号文章、Markdown、Obsidian、Logseq、个人知识库、本地运行和隐私边界等任务语义，没有采用机械关键词列表。
- `package.json` 已有英文产品描述及 `wechat-article`、`wechat-official-account`、`markdown`、`obsidian`、`logseq`、`local-first` 等关键词。
- GitHub About 已配置 12 个相关 Topics，覆盖问题域、目标格式、目标知识库和技术形态。GitHub 官方确认 Topics 用来帮助用户探索特定主题并发现解决方案。[GitHub Topics 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- 已有固定 Release，后续可以用 Release asset 的 `download_count` 衡量比 Star 更接近采用的行为。[GitHub Releases API 官方文档](https://docs.github.com/en/rest/releases/assets)

### 仍存在的缺口

- About Description 只有英文。对“公众号文章归档”“微信文章转 Markdown”等中文默认仓库搜索，它没有提供中文匹配信号。
- GitHub 仓库页同时出现项目名 `wechat-notebank`、推荐命令 `alskai-notebank`、兼容命令 `wechat-notebank` 和中文展示名，README 虽逐处解释，但缺少一个集中、稳定的“这些名称属于同一个产品”的实体声明。
- README 已经很长，且同时承担产品定位、安装、完整 CLI 手册和知识加工工作流。长文并非排名问题，但核心“微信公众号文章归档工具”容易被后半部分的大量加工流程稀释。GitHub 对 README 的官方定位是说明项目做什么、为什么有用、如何开始和去哪里求助；较长文档更适合独立文档页。[GitHub README 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- 当前截图中的预览图 alt 为泛化的 `image`，没有向读者或搜索系统说明“归档后的文件夹结构”“微信公众号文章转 Markdown 效果”。Google 建议把用户会搜索的词自然放在标题、主标题、alt 与链接文字等显著位置。[Google Search Essentials](https://developers.google.com/search/docs/essentials)
- 仓库没有独立 Homepage URL。只依赖 GitHub 时，项目方无法控制 GitHub 域名的 robots.txt、页面 `<title>`、meta description、canonical、`hreflang`、sitemap、结构化数据和站点级分析。

## 1. GitHub About 的语言策略

### 决策：中文优先、英文保留

推荐 Description：

```text
微信公众号文章转 Markdown：本地归档到 Obsidian、Logseq 和个人知识库 | Archive WeChat articles as local Markdown.
```

这条文案承担四个任务：

- 中文用户一眼看到“微信公众号文章转 Markdown”这一核心任务。
- 中文默认 GitHub 搜索获得“微信公众号文章”“Markdown”“本地归档”“个人知识库”信号。
- 保留 `WeChat articles`、`local Markdown`，避免丢掉现有英文发现入口。
- 避免把工具描述成公众号爬虫、微信收藏读取器或已失效文章恢复工具。

不推荐纯中文，因为项目仍然使用英文仓库名、英文 Topics、npm / CLI 生态和跨平台技术栈；完全删除英文会无谓损失英文 GitHub 搜索与外部搜索语义。也不推荐继续纯英文，因为 GitHub 官方说明：省略 `in` qualifier 时，默认只搜名称、Description 和 Topics，README 的中文不会自动补上这一缺口。[GitHub 仓库搜索官方文档](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)

### Topics 策略

当前 12 个 Topics 基本合理：

```text
wechat
wechat-article
wechat-official-account
markdown
obsidian
logseq
knowledge-base
article-archiver
local-first
cli
typescript
personal-knowledge-management
```

下一步不应为了“覆盖更多词”继续堆满 20 个。只有当真实搜索基线显示缺口时，才测试增加 `wechat-markdown`、`wechat-archive` 或 `chinese`。Topic 应表达用途、主题、社区或语言等重要特征；GitHub 也会分析公开仓库内容并给出建议 Topic。[GitHub Topics 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

## 2. README、仓库元数据和实体信号

### 统一产品实体

建议在 README 首屏附近放一个极短的命名说明：

```text
项目名：wechat-notebank
推荐命令：alskai-notebank
兼容命令：wechat-notebank
中文展示名：ALSKai 公众号文章归档
```

这是项目层面的信息架构判断，不是某个搜索引擎公布的排名因子。价值在于让人、搜索引擎和 AI 系统不必猜测这些名称是否指向同一个工具。随后应在 GitHub About、README、Release、`package.json`、Skill 展示名和未来官网重复同一条核心定义：

```text
wechat-notebank 是把微信公众号文章保存为本地 Markdown，并归档到 Obsidian、Logseq 或个人知识库的开源工具。
```

### README 信息层级

建议把仓库首页维持在“可以独立完成首次判断和首次运行”的长度，把完整参考拆到 `docs/`：

1. H1：`wechat-notebank`。
2. 中文核心价值句与英文摘要。
3. 30 秒效果：输入一个微信文章 URL，得到什么文件与元数据。
4. 最短安装与最短命令。
5. 为什么可信：本地运行、不上传知识库、保存原文不需要模型 API key。
6. 能做、不能做的边界。
7. 链接到安装、批量导入、知识加工、故障排查、Release 与 Issues。

GitHub 官方建议 README 说明项目做什么、为什么有用、如何开始、如何求助和谁在维护，并建议把较长说明放到其他文档中。[GitHub README 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

### 关键词设计

不要维护一份“关键词词库”然后在各处重复粘贴。应围绕不同搜索意图各写一段真实内容：

- 问题意图：保存、备份、归档、下载、导出微信公众号文章。
- 转换意图：微信文章转 Markdown、公众号文章转 Markdown。
- 目标意图：保存到 Obsidian、Logseq、本地文件夹、个人知识库。
- 批量意图：Excel / Numbers 中的公众号链接批量归档。
- 信任意图：本地运行、不上传知识库、不依赖大模型保存原文。

Google 的核心建议是使用用户实际会用来搜索的词，并把它们自然放在标题、主标题、alt 和链接文字等明显位置；关键词堆砌则属于 spam。[Google Search Essentials](https://developers.google.com/search/docs/essentials)；[Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing)

`package.json` keywords 和 GitHub Topics 可以继续服务各自平台的机器分类，但不要把它们等同于 Google 排名信号。Google 明确不使用 HTML `meta keywords` 做索引或排名。[Google 支持的 meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags)

### 真实证据比同义词更重要

后续内容应优先增加项目独有、可验证的信息：

- 一张真实的输入链接到 Markdown 输出示例。
- 输出 Frontmatter 的字段说明。
- 支持平台、支持版本和已知边界。
- 本地运行与隐私数据流图。
- Release 版本、校验方式和变更记录。
- 常见失败的真实症状、原因和修复。

Google 的 people-first 指南强调清晰的作者、产生过程、第一手经验与独特价值；只汇总别人已经说过的内容或批量生成近似页面不属于长期有效策略。[Google people-first content 指南](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

### 图片与社交预览

- 把 `alt="image"` 改成描述实际内容的中文，例如“wechat-notebank 归档后的 Markdown 文件夹结构”。
- 设置一张中英都能理解的 GitHub Social Preview，标题尽量短，画面表达“微信文章 → Markdown → Obsidian”。GitHub 官方说明 Social Preview 会在仓库链接被分享到社交平台时展示，并建议使用至少 640×320、最佳 1280×640 的图片。[GitHub Social Preview 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)

## 3. 何时需要官网或文档站

### 建议的阶段性判断

仓库内元数据足以完成低成本起步，但无法提供完整站外 SEO / GEO 控制。如果下一阶段目标是让用户在 Google、Bing、ChatGPT、Claude 或 Perplexity 中通过“微信公众号文章怎么保存到 Obsidian”等问题发现项目，应建设一个轻量、可维护的站点，并把它填入 GitHub About 的 Website 字段。

站点的最低可用结构：

```text
/zh/                         中文首页
/zh/docs/install/            安装与环境要求
/zh/docs/wechat-to-markdown/ 单篇归档完整教程
/zh/docs/batch-import/       Excel / Numbers 批量导入
/zh/docs/privacy/            本地运行与隐私边界
/en/                         英文首页
/en/docs/...                 只有在能持续维护时再提供英文对应页
```

每页必须解决不同任务，不能只是替换关键词的近似副本。Google 的 2026 生成式 AI 指南明确反对为了 query fan-out 批量创建搜索变体页面，也明确建议忽略 AEO/GEO 捷径。[Google 生成式 AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

### 中英文网页

若建设官网，中英文应使用不同 URL，并在页面之间互相链接，使用 `hreflang` 标注对应版本。Google 建议每种语言使用不同 URL，而不是根据 Cookie 或浏览器语言动态替换同一 URL；Google 主要根据页面可见文本判断语言。[Google 多语言站点指南](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)；[Google localized versions 指南](https://developers.google.com/search/docs/specialty/international/localized-versions)

README 可以继续中文优先并保留英文摘要。如果英文使用需求真实存在，再新增 `README.en.md`，在两个 README 顶部互链。它对 GitHub 用户有价值，但不应替代官网的 `/zh/`、`/en/` 与 `hreflang`。

### 站点技术底线

- 唯一、描述性的 `<title>`、H1 和 meta description。Google 主要从页面正文生成 snippet，也可能在更合适时使用 meta description；关键词字符串并不是高质量 description。[Google snippet 指南](https://developers.google.com/search/docs/appearance/snippet)
- 关键价值、安装、兼容性和边界必须以可见文本呈现，不要只放图片。Google 对 AI features 的官方建议同样要求重要内容有文本形式。[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)
- 提供 canonical、XML sitemap 和可抓取的内部链接。提交 sitemap 是提示，不保证抓取或排名。[Google sitemap 指南](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- 在 robots.txt 中声明 sitemap，并确认没有误拦 Googlebot、Bingbot、OAI-SearchBot、Claude-SearchBot 与 PerplexityBot。
- 结构化数据必须与页面可见内容一致。可以在独立站点测试 `SoftwareApplication`，但它不是 GEO 排名开关；Google 也不保证正确结构化数据一定显示 rich result。[Google structured data 介绍](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)；[Google SoftwareApplication 文档](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- 配置 Google Search Console 和 Bing Webmaster Tools，提交 sitemap 并监控索引、查询、点击和抓取错误。[Google Search Console 指南](https://developers.google.com/search/docs/monitor-debug/search-console-start)；[Bing Webmaster Tools 指南](https://blogs.bing.com/webmaster/June-2025/Start-Using-Bing-Webmaster-Tools-to-Improve-Your-Site-Visibility)
- 对站点新增、更新和删除 URL，可使用 IndexNow 通知参与的搜索引擎；它加快变更发现，不保证收录或引用。[IndexNow 官方文档](https://www.indexnow.org/documentation)；[Bing sitemap 与 AI 搜索说明](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search)

## 4. GEO：有证据的动作与行业猜想

### 有官方证据支持

#### 允许正确的搜索爬虫

- OpenAI 把搜索与训练分成独立控制：允许 `OAI-SearchBot` 可让网站进入 ChatGPT Search，禁止 `GPTBot` 则表示不用于基础模型训练，两项可独立设置。[OpenAI crawlers 官方文档](https://developers.openai.com/api/docs/bots)
- Anthropic 使用 `Claude-SearchBot` 改善搜索结果质量；禁用它可能降低网站在 Claude 搜索中的可见性和准确性。`ClaudeBot` 才是潜在训练用途，`Claude-User` 是用户发起的访问。[Anthropic bots 官方文档](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- Perplexity 建议允许 `PerplexityBot` 及其公布的 IP 范围以进入 Perplexity 搜索结果；该机器人不用于基础模型训练。[Perplexity crawlers 官方文档](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)

这些设置只适用于项目可控制的站点。当前 GitHub 仓库页面位于 `github.com`，项目维护者不能为单个仓库修改 GitHub 的 robots.txt 或 WAF。

#### 沿用基础 SEO

Google 明确说明，AI Overviews 与 AI Mode 没有额外技术要求；页面需要先被索引并符合显示 snippet 的条件。官方建议仍是允许抓取、建立内部链接、提供良好页面体验、让重要内容以文本存在，并保持结构化数据与可见文本一致。[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)

#### 提供可引用的清晰、真实信息

Bing 建议通过清晰标题、结构和 FAQ 帮助系统定位信息，以示例、数据和来源支持声明，并保持内容准确与新鲜；同时明确 citation count 不代表排名、权威或答案中的位置。[Bing AI Performance 官方说明](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)

对本项目而言，最值得被引用的原子事实是：工具解决什么任务、支持哪些输入输出、在哪些平台运行、数据是否离开本机、需要哪些依赖、当前版本是什么、哪些能力明确不支持。清晰短段落和稳定锚点有利于人和机器准确引用，但“分块本身能提高排名”没有官方证据。

#### 测量实际可见性

- ChatGPT 自动给搜索结果的引荐 URL 加 `utm_source=chatgpt.com`，可在分析工具中统计。[OpenAI Publishers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- Bing Webmaster Tools 的 AI Performance 可查看 Total Citations、Average Cited Pages、Grounding Queries 和页面级引用趋势；这些指标表示被引用，不表示排名或权威。[Bing AI Performance 官方说明](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)
- Google Search Console 已开始向部分站点推出独立的生成式 AI 可见性报告；在未获得该报告前，AI features 仍包含在 Web 搜索整体数据中。[Google 生成式 AI Performance 报告公告](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)；[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)

### 目前只能作为实验或推断

- `llms.txt` 会提高 ChatGPT、Claude、Perplexity 引用率：没有这些平台的官方排名承诺；Google 明确说不需要 AI 文本文件，并在 2026 指南中将 `llms.txt` 列为可忽略的 GEO 捷径。[Google 生成式 AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- 为 AI 特意把文章切成固定字数段落会提高引用：没有通用官方证据。可以为了可读性使用短段落和标题，但不要把它包装成排名机制。
- FAQ schema 会提高 AI 引用：没有官方保证。结构化数据应与可见内容一致，且 Google 明确说 AI features 不需要特殊 schema。[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)
- 重复品牌名、堆同义词或加入隐藏关键词会提高“实体权重”：没有可信证据，反而可能落入关键词堆砌或 cloaking。[Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- 批量制造“微信公众号文章保存的 100 种问法”页面能覆盖 query fan-out：Google 明确反对为了操纵搜索或生成式回答而批量生产近似内容。[Google 生成式 AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- 买软文、交换链接或制造不真实提及能提升 AI 推荐：没有可靠官方证据；Google 将以操纵排名为目的的链接列为 link spam。[Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies#link-spam)

## 5. 指标体系

### 北极星指标

SEO / GEO 的最终成功不应定义为“被搜到”或“被 AI 提到”，而应定义为来自自然发现的合格用户完成首次安装和归档。当前项目坚持本地运行与不上传知识库，不应为了归因加入读取用户文章或知识库的遥测。

可采用的公开、低侵入代理指标：

1. 固定 Release 资产下载数。
2. GitHub unique clones，而非单纯 page views。
3. 新用户创建的有效 Issue / Discussion 中，能确认其通过搜索或 AI 发现项目的数量。
4. 项目既有“公共采用验证”中的独立成功样本。

### 分层指标

#### GitHub 发现层

- 固定中文查询：`公众号文章归档`、`微信公众号文章 Markdown`、`微信文章转 Obsidian`。
- 固定英文查询：`wechat article markdown`、`wechat official account archive`、`wechat obsidian`。
- 每月记录仓库是否进入前 20 / 50 个结果及大致位置，同时保留查询时间、登录状态与排序方式。GitHub 搜索排名会变化，这只是方向性观察。
- 每周保存 GitHub Traffic 的 views、unique visitors、clones、unique cloners、referrers 和 popular content。GitHub UI 和 API 只保留最近 14 天数据，因此必须定期快照。[GitHub Traffic 官方文档](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)；[GitHub Traffic API](https://docs.github.com/en/rest/metrics/traffic)
- 每个 Release 记录资产 `download_count`。[GitHub Releases API](https://docs.github.com/en/rest/releases/assets)

#### 搜索引擎层，仅在有独立站点后

- Google Search Console：索引页数、抓取问题、按 query / page / country 拆分的 impressions、clicks、CTR 和 average position。[Google Search Console 指南](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- Bing Webmaster Tools：索引、crawl health、search impressions / clicks / position，以及 AI Performance 的 citation、cited pages 和 grounding queries。[Bing Webmaster Tools](https://blogs.bing.com/webmaster/June-2025/Start-Using-Bing-Webmaster-Tools-to-Improve-Your-Site-Visibility)；[Bing AI Performance](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)
- 按中文与英文查询簇分别看趋势，避免总量上涨掩盖目标中文流量没有改善。

#### AI 发现层

- ChatGPT 引荐 sessions：`utm_source=chatgpt.com`。
- Claude、Perplexity、Copilot 等可识别 referrer 或 UTM 的 sessions。
- Bing AI citations 与 cited pages。
- 固定问题集的月度人工基准：每个平台、每个问题重复 3 次，记录是否提及项目、是否给出正确 GitHub / 官网链接、是否正确描述能力边界。此项不是平台官方排名指标，只用于发现明显退化，不能把单次回答当成结论。

### 评估周期

- GitHub About 和 README 修改后，先观察 4 周 GitHub Traffic 与固定查询。
- 独立站点上线后，至少用 8 到 12 周判断搜索趋势。Google 明确表示重新抓取可能需要数天到数月，且满足要求也不保证收录或展示。[Google AI features 指南](https://developers.google.com/search/docs/appearance/ai-features)
- 所有实验先记录变更前基线；一次只改一组高影响变量，避免无法归因。

## 6. 阶段优先级

### P0：建立基线，本周完成

1. 在任何新改动前导出最近 14 天 GitHub Traffic 和当前 Release 下载数。
2. 记录六个固定中英文 GitHub 查询的结果位置。
3. 保存当前 About、Topics、README 首屏和 Star / Fork 基线。
4. 明确北极星指标是“合格用户完成首次归档”，Star 只是辅助信号。

### P1：仓库内优化，1 至 2 天

1. 将 About 改为本文建议的中英双语 Description。
2. 保留现有 12 个英文 Topics，暂不扩充。
3. 在 README 首屏集中说明项目名、推荐命令、兼容命令与中文展示名的关系。
4. 调整图片 alt，给预览图写真实用途描述。
5. 审查 README 首屏 200 至 300 字，确保核心归档任务、最短命令和隐私边界没有被加工工作流稀释。
6. 配置 GitHub Social Preview。

验收标准不是“排名立刻上升”，而是六个固定查询都有明确的可匹配字段，所有名称能被人和 Agent 无歧义映射到同一项目。

### P2：可控制的官网 / 文档站，2 至 4 周

只有当项目确定要获取 GitHub 站外用户时进入此阶段：

1. 建设中文优先、英文可选的轻量站点。
2. 使用 `/zh/` 与 `/en/` 独立 URL 和 `hreflang`。
3. 配置 title、description、canonical、sitemap、robots、结构化数据与内部链接。
4. 接入 Search Console、Bing Webmaster Tools 和不读取用户知识库的站点分析。
5. 明确允许 OAI-SearchBot、Claude-SearchBot、PerplexityBot；训练爬虫是否允许由项目另行做内容许可决策。
6. 把站点 URL 写入 GitHub About Website，并让官网、仓库、Release、文档相互链接。

### P3：内容与 GEO 实验，持续进行

1. 根据 Search Console query 与 Bing grounding queries 补充真实缺失内容。
2. 优先写第一手教程、兼容性、失败诊断和数据流说明。
3. 每月跑固定 AI 问题集，记录正确引用率和事实准确率。
4. 只有在基础抓取、索引和内容完成后，才把 `llms.txt` 等做成有对照组的低优先级实验；默认不实施。

## 7. 对既有 2026-07-12 设计的修订建议

现有 `docs/superpowers/specs/2026-07-12-jtbd-seo-geo-design.md` 的总体 JTBD 和 README / package / Topics 方向成立，本调研只建议修订三点：

1. GitHub Description 从纯英文改为中文优先的双语句子。原因是 GitHub 默认搜索不会自动搜索 README，中文 About 有独立价值。
2. 把“GEO”拆成两层：仓库内的 Agent skill 发现属于 Agent 产品内路由；公网 AI 可见性属于 crawl、index、retrieval 和 citation。两者指标不同，不应混用“skill 触发率”和“AI 搜索引用率”。
3. 增加独立站点的条件式路线。GitHub-only 可以优化 GitHub 搜索与首屏理解，但无法控制站点级 SEO / GEO 基础设施。

## 官方来源索引

- [GitHub：Searching for repositories](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)
- [GitHub：Classifying your repository with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)
- [GitHub：About the repository README file](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [GitHub：Viewing traffic to a repository](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository)
- [Google：Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google：AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google：Optimizing for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google：Managing multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google：Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google：Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Bing：AI Performance in Bing Webmaster Tools](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)
- [Bing：Sitemaps in AI-powered search](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search)
- [OpenAI：Overview of OpenAI Crawlers](https://developers.openai.com/api/docs/bots)
- [OpenAI：Publishers and Developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
- [Anthropic：Web crawlers and site-owner controls](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity：Perplexity Crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
- [IndexNow：Documentation](https://www.indexnow.org/documentation)
