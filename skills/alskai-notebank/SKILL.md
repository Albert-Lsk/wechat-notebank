---
name: alskai-notebank
description: Use when the user wants to save, archive, back up, download, export, or migrate WeChat public account (微信公众号) articles; convert WeChat articles to Markdown; move WeChat links into Obsidian, Logseq, a folder, or a knowledge base; batch import article URLs from Excel or Numbers; or keep WeChat content from becoming lost or unsearchable.
---

# alskai-notebank

The Agent is the product interface. The CLI owns deterministic storage, configuration, deduplication, and machine-readable results.

## Route by intent

- Any archive request for one or multiple URLs, including Excel or Numbers workbooks: **read and follow [Archive and batch import](references/archive.md)**.
- Installation, diagnosis, content generation, and publishing are separate routes. Do not load archive instructions for them.
- Reading, summarizing, translating, formatting, or analyzing an article without a save/archive request: do not use this skill.

## Public boundaries

- Load only the reference required by the current route.
- Never assume user identity or content goal.
- Do not reimplement fetching, parsing, configuration resolution, deduplication, workbook import, or file writes in the Agent.
- Do not promise recovery of unavailable articles or interact with WeChat accounts.
- Do not upload, copy, or expose the user's Obsidian vault.
