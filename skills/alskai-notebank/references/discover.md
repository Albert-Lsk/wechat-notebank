# Discover articles

Load this reference when the user wants to find what a WeChat public account has published, see its recent articles, enumerate its past articles before choosing what to archive, or check updates from an RSS or subscription feed the user follows.

## Boundary

Use the resolved CLI selected by the entry Skill. Discovery is read-only: the CLI returns article metadata and, when it can safely resolve one, an `mp.weixin.qq.com` direct URL. It does not fetch article bodies or write archive files.

Do not inspect configuration files, browser state, or archive folders in the Agent. Do not scrape Sogou or the mirror site yourself; all discovery requests go through the CLI.

Always invoke `search` with `--json`, and parse the single JSON envelope on stdout. Progress and diagnostics may be written to stderr. A completed response with `items: []` is a valid empty result, not a reason to retry.

## Choose a source

- For a recent list or a question such as “what has this account published lately?”, use the Sogou source with the account name as the query:

  ```bash
  alskai-notebank search "<public-account-name>" --source sogou --limit 10 --json
  ```

  Use `--account "<exact-public-account-name>"` when the user asks for exact account filtering. Sogou is the recent-article source and accepts a limit from 1 to 10.

- For a complete or older history, use the mirror source with a column URL:

  ```bash
  alskai-notebank search "https://www.jintiankansha.me/column/<id>" --source mirror --limit 100 --json
  ```

  If the user gives only an account name, ask them to open `jintiankansha.me`, search for that account, and copy its column URL. The column URL is the reliable input for a full-history scan; do not invent one. Mirror accepts a limit from 1 to 100 and includes `columnUrl` in its result.

  A query whose host is `jintiankansha.me` is routed to mirror automatically, while `--source` can explicitly override the route. Keep the source choice aligned with the user's intent: recent articles use Sogou; full history uses a mirror column URL.

- For an RSS or subscription feed — the user says something like “看我订阅的博主更新” / "check updates from the bloggers I subscribe to", or hands you a feed URL — use `import-rss`:

  ```bash
  alskai-notebank import-rss "<feed-url>" --limit 20 --json
  ```

  `import-rss` accepts RSS 2.0, Atom, and JSON Feed sources and returns the same envelope shape as `search`, with `result.items` of `{title, link, pubDate, resolvable}`. An item is `resolvable:true` only when its link is an `mp.weixin.qq.com` article URL; other domains are still listed but with `resolvable:false`, and the result carries a `note` explaining that the current fetch supports WeChat article pages only. `--limit` defaults to 20 and accepts 1 to 100.

  When the user wants a complete or ongoing article list for an account but has neither a mirror column URL nor a feed URL, suggest the companion-service route described in the README: self-host wewe-rss, log in once with the WeChat Reading (微信读书) scan in its own interface, and subscribe there. Then hand the resulting feed URL to `import-rss` (`/feeds/all.atom`, `/feeds/all.rss`, or `/feeds/all.json` on the user's own host). Deployment, upgrades, and account management happen in wewe-rss itself; do not attempt them from the Agent, and do not invent a feed URL.

## Run one search

Run exactly one `search` command for a discovery task. Do not call `search` in a loop, poll it, or automatically retry it. If the CLI reports `SOGOU_CAPTCHA` or another anti-spider/verification page, stop immediately, tell the user that the source was blocked, and offer waiting, a lower-frequency later attempt, a mirror column URL, or a direct article URL. Never retry after a CAPTCHA in the same task.

The same one-shot boundary applies to `import-rss`: run exactly one `import-rss` command per feed, and do not loop, poll, or fan out over many feeds in a single task. For `import-rss`, `FEED_UNAVAILABLE` means the feed could not be reached (source down or wrong URL) and `FEED_PARSE_FAILED` means the server returned content that is not a feed; report `error.code` and `error.message` and let the user decide whether to retry — do not retry automatically.

A mirror full-history scan is deliberately a gentle, potentially long task. Before starting it, tell the user how many items you intend to request (`--limit`, up to 100) and an estimated duration based on the expected pages/items and configured interval; if the exact count is unknown, say that the estimate is a limit-based upper bound and may finish earlier. Do not hide the wait or launch parallel scans.

## Interpret and present results

Show the returned `title`, `account`, and `pubDate` for each item, preserving the CLI order. Report an item with `resolved:false` as unresolved and explain that no safe WeChat direct URL could be recovered; its `sourceUrl:null` is intentional. Do not silently drop unresolved items or present a mirror `/t/` page as an archive URL.

For `import-rss` results, an item with `resolvable:false` is a listed-but-unarchivable entry (its link is not an `mp.weixin.qq.com` article page), not an error. Present it with its `link` so the user can still see what the feed contains, and rely on the result `note` when explaining why it cannot be archived.

Treat `status: "completed"` with an empty list as a successful no-match result. For `status: "partial"`, retain and present the already-resolved items together with the structured error; do not rerun the search to fill the list. For a failed result, report `error.code` and `error.message` without claiming discovery succeeded.

## Archive selected articles

Discovery and archiving are separate steps. Present the list and ask which articles the user wants to save (or obtain explicit confirmation for the requested set), then hand each selected direct URL to the archive route:

```bash
alskai-notebank fetch "<item.sourceUrl>" --json
```

Use `sourceUrl` only when `resolved:true` and it is the returned `mp.weixin.qq.com` URL. Never pass a Sogou `rawLink` to `fetch`: that session-bound link can expire. For `import-rss`, pass `item.link` to `fetch` only when `resolvable:true`; `import-rss` itself never writes archive files, so archiving always goes through the user's explicit selection, fetched one URL at a time. Never bulk-archive a feed automatically.

## Non-goals

- Do not implement a crawler, account-level collection job, subscription, or scheduled monitor in the Agent.
- Do not log in, bypass a CAPTCHA, defeat anti-spider controls, or use a VIP mirror page to fetch article bodies.
- Do not replace the CLI's URL safety checks, throttling, source routing, or JSON result semantics with Agent logic.
