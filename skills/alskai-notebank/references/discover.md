# Discover articles

Load this reference when the user wants to find what a WeChat public account has published, see its recent articles, or enumerate its past articles before choosing what to archive.

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

## Run one search

Run exactly one `search` command for a discovery task. Do not call `search` in a loop, poll it, or automatically retry it. If the CLI reports `SOGOU_CAPTCHA` or another anti-spider/verification page, stop immediately, tell the user that the source was blocked, and offer waiting, a lower-frequency later attempt, a mirror column URL, or a direct article URL. Never retry after a CAPTCHA in the same task.

A mirror full-history scan is deliberately a gentle, potentially long task. Before starting it, tell the user how many items you intend to request (`--limit`, up to 100) and an estimated duration based on the expected pages/items and configured interval; if the exact count is unknown, say that the estimate is a limit-based upper bound and may finish earlier. Do not hide the wait or launch parallel scans.

## Interpret and present results

Show the returned `title`, `account`, and `pubDate` for each item, preserving the CLI order. Report an item with `resolved:false` as unresolved and explain that no safe WeChat direct URL could be recovered; its `sourceUrl:null` is intentional. Do not silently drop unresolved items or present a mirror `/t/` page as an archive URL.

Treat `status: "completed"` with an empty list as a successful no-match result. For `status: "partial"`, retain and present the already-resolved items together with the structured error; do not rerun the search to fill the list. For a failed result, report `error.code` and `error.message` without claiming discovery succeeded.

## Archive selected articles

Discovery and archiving are separate steps. Present the list and ask which articles the user wants to save (or obtain explicit confirmation for the requested set), then hand each selected direct URL to the archive route:

```bash
alskai-notebank fetch "<item.sourceUrl>" --json
```

Use `sourceUrl` only when `resolved:true` and it is the returned `mp.weixin.qq.com` URL. Never pass a Sogou `rawLink` to `fetch`: that session-bound link can expire. Never make `search` automatically archive every result, and keep the normal one-URL-at-a-time confirmation boundary for account discovery.

## Non-goals

- Do not implement a crawler, account-level collection job, subscription, or scheduled monitor in the Agent.
- Do not log in, bypass a CAPTCHA, defeat anti-spider controls, or use a VIP mirror page to fetch article bodies.
- Do not replace the CLI's URL safety checks, throttling, source routing, or JSON result semantics with Agent logic.
