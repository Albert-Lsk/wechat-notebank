---
name: alskai-notebank
description: Use when the user wants to save, archive, back up, download, export, or migrate WeChat public account (微信公众号) articles; convert WeChat articles to Markdown; move WeChat links into Obsidian, Logseq, a local folder, or a personal knowledge base; batch import article URLs from Excel or Numbers; or keep valuable WeChat content from becoming lost or unsearchable.
---

# alskai-notebank

Use the local `alskai-notebank` CLI as the source of truth. Do not reimplement article fetching, parsing, deduplication, or Excel import logic inside the agent.

## Supported Requests

- `/alskai-notebank <WeChat article URL> -o <folder>`
- `/alskai-notebank <WeChat article URL> --output <folder>`
- `/alskai-notebank import <Excel file>`
- `/alskai-notebank import <Numbers file>`
- Natural-language requests to save or migrate one or many WeChat public account articles, even when the user does not name `alskai-notebank`.

## Intent Mapping

Map the user's desired outcome to the CLI even when they do not name the tool:

- Saving, backing up, exporting, or archiving one WeChat article -> single-article command.
- Moving WeChat articles into Obsidian, Logseq, Markdown, a local folder, or a personal knowledge base -> single-article command for one URL, import for a workbook.
- Preserving articles before links disappear or become hard to find -> archive locally; do not promise recovery of already unavailable content.
- Writing, publishing, formatting, summarizing, or analyzing content without an archive request -> do not use this skill.

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
