---
name: alskai-notebank
description: Use when the user wants to install, update, diagnose, or repair alskai-notebank; save, archive, export, migrate, or process WeChat public account (微信公众号) articles; convert them to Markdown; batch import URLs from Excel or Numbers; turn saved articles into reviewable knowledge candidates; or review, approve, reject, and revoke generated knowledge assets.
---

# alskai-notebank

The Agent is the product interface. The CLI owns deterministic storage, configuration, deduplication, and machine-readable results.

Resolve the CLI once before loading a route: use `command -v alskai-notebank` when it succeeds; otherwise use `$HOME/.local/bin/alskai-notebank` when that file is executable. Use this resolved CLI path for every command in the loaded reference. If neither path is available, load the setup route.

## Route by intent

- Installation, update, environment diagnosis, or Agent integration repair: **read and follow [Setup and doctor](references/setup.md)**.
- Archive requests for one or multiple URLs, including Excel or Numbers workbooks: **read and follow [Archive and batch import](references/archive.md)**.
- Requests to process a saved article or an archive result into reviewable candidates: **read and follow [Content processing](references/processing.md)**.
- Requests to inspect a pending pack, answer L4 questions, approve or reject candidates, or revoke published assets: **read and follow [Review and publishing](references/review.md)**.
- Reading, summarizing, translating, formatting, or analyzing an article without a save/archive request: do not use this skill.

## Public boundaries

- Load only the reference required by the current route.
- Never assume user identity or content goal.
- Do not reimplement fetching, parsing, configuration resolution, deduplication, workbook import, or file writes in the Agent.
- Do not promise recovery of unavailable articles or interact with WeChat accounts.
- Do not upload, copy, or expose the user's Obsidian vault.
