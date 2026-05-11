# alskai-notebank Codex Skill Plan

## Goal

Package `alskai-notebank` as a Codex skill so users can ask Codex to archive WeChat articles without remembering the terminal workflow.

The skill should call the local CLI. It should not reimplement article fetching, parsing, routing, or Excel import logic.

## User-Facing Commands

```text
/alskai-notebank <文章链接> -o <文件夹地址>
/alskai-notebank import <Excel文件地址>
```

These map to:

```bash
alskai-notebank <文章链接> -o <文件夹地址>
alskai-notebank import <Excel文件地址>
```

## Skill Responsibilities

- Detect a single WeChat article URL and optional output folder.
- Detect Excel import requests.
- If the user provides a Numbers file, export it to `.xlsx` first.
- Run the CLI command from the user's local environment.
- Summarize saved, skipped, and failed rows from CLI output.
- Preserve the CLI's idempotency behavior: already archived `sourceUrl` values are skipped.

## Non-Goals

- Do not add a separate crawler inside the skill.
- Do not upload or copy the user's Obsidian vault.
- Do not guess target folders unless a future auto-route feature is explicitly enabled.
- Do not perform likes, favorites, or other WeChat account interactions.

## Draft SKILL.md

````markdown
---
name: alskai-notebank
description: Use when the user wants to archive WeChat public account articles into a local Markdown/Obsidian knowledge base using `alskai-notebank`, including single article saves and Excel batch imports.
---

# alskai-notebank

Use the local CLI as the source of truth.

## Single Article

When the user provides:

```text
/alskai-notebank <url> -o <folder>
```

Run:

```bash
alskai-notebank <url> -o <folder>
```

If `-o` is omitted, let the CLI use its configured default archive path.

## Batch Import

When the user provides:

```text
/alskai-notebank import <Excel file>
```

Run:

```bash
alskai-notebank import <Excel file>
```

If the file is `.numbers`, export it to a temporary `.xlsx` file first, then import that `.xlsx`.

## Output

Report the CLI summary:

- saved count
- skipped count
- failure count
- saved file paths when available

Do not reimplement fetching or parsing logic in the skill.
````
