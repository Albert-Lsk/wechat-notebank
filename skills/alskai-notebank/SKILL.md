---
name: alskai-notebank
description: Use when the user wants to archive WeChat public account articles into a local Markdown or Obsidian knowledge base with alskai-notebank, including single article URLs, output folders, Excel or Numbers batch imports, and /alskai-notebank-style requests.
---

# alskai-notebank

Use the local `alskai-notebank` CLI as the source of truth. Do not reimplement article fetching, parsing, deduplication, or Excel import logic inside the agent.

## Supported Requests

- `/alskai-notebank <WeChat article URL> -o <folder>`
- `/alskai-notebank <WeChat article URL> --output <folder>`
- `/alskai-notebank import <Excel file>`
- `/alskai-notebank import <Numbers file>`
- Natural-language requests to archive one or many WeChat public account articles with `alskai-notebank`.

## Workflow

1. Verify the CLI exists:
   ```bash
   command -v alskai-notebank
   ```
2. For a single article, run:
   ```bash
   alskai-notebank <url> -o <folder>
   ```
   If the user omits `-o`, run the command without it and let the CLI use its configured default archive path.
3. For Excel batch import, run:
   ```bash
   alskai-notebank import <file.xlsx>
   ```
4. For Numbers batch import, export to a temporary `.xlsx` first, then import that exported workbook.
5. Summarize the CLI output: saved files, skipped rows, failures, and any next action.

## Numbers Export

Use macOS Numbers through AppleScript:

```bash
mkdir -p /tmp/alskai-notebank-import
osascript <<'APPLESCRIPT'
set inputFile to POSIX file "/absolute/path/to/articles.numbers"
set outputFile to POSIX file "/tmp/alskai-notebank-import/articles.xlsx"
tell application "Numbers"
  activate
  set theDocument to open inputFile
  delay 1
  export theDocument to outputFile as Microsoft Excel
  close theDocument saving no
end tell
APPLESCRIPT
alskai-notebank import /tmp/alskai-notebank-import/articles.xlsx
```

## Output Rules

- Do not claim success until the CLI exits successfully.
- If import reports failures, include the row numbers and reasons.
- If rows are skipped because `sourceUrl` already exists, report that as normal idempotent behavior.
- Do not like, favorite, or otherwise interact with WeChat accounts.
- Do not upload, copy, or expose the user's Obsidian vault.
