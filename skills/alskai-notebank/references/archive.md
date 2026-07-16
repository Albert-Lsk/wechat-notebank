# Archive and batch import

Load this reference only when the user wants to save, archive, back up, download, export, or migrate WeChat public account articles.

## Boundary

Use the installed `alskai-notebank` CLI. Do not inspect configuration files or archive folders to resolve paths or duplicates; the CLI owns those facts. If `command -v alskai-notebank` fails, stop and route to installation instead of running repository internals.

Always request JSON so Agent behavior does not depend on human-readable logs.

## Single URL

Use the configured archive path:

```bash
alskai-notebank fetch "<url>" --json
```

Only when the user explicitly supplies a destination:

```bash
alskai-notebank fetch "<url>" --output "<folder>" --json
```

For multiple URLs supplied directly, run the single-URL command once per URL in input order. Continue after an individual failure and keep one result per input URL. Do not turn this into a crawler or account-level collection job.

## Workbook import

For an Excel workbook:

```bash
alskai-notebank import "<file.xlsx>" --json
```

For a Numbers workbook, export a copy to a temporary `.xlsx` with macOS Numbers, then run the same import command. Do not modify the original workbook.

## Interpret results

- Parse the single JSON document on stdout even when the exit code is `1`; stderr contains progress and diagnostics only.
- Single `saved`: report `result.savedFile`.
- Single `skipped` with `result.reason: "SOURCE_URL_EXISTS"`: report the existing `result.savedFile` as a normal idempotent result, not an error.
- Single `failed`: report `error.code` and `error.message` without claiming success.
- Workbook import: report every `result.items` entry in input order, including its row number, status, saved file or failure reason. A `partial` result exits `1` but still contains successful and skipped items.
- Multiple direct URLs: aggregate the individual JSON results in input order and report saved, skipped, and failed counts.

If the user explicitly says “only save,” stop after reporting these results. Do not load unrelated content-generation instructions.
