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

For a Numbers workbook, export a temporary copy with macOS Numbers. Replace only `input_file`; keep the original document unchanged:

```bash
(
set -e
input_file="/absolute/path/to/articles.numbers"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/alskai-notebank-import.XXXXXX")"
output_file="$temp_dir/articles.xlsx"
cleanup() { rm -rf "$temp_dir"; }
trap cleanup EXIT

osascript - "$input_file" "$output_file" <<'APPLESCRIPT'
on run argv
  set inputFile to POSIX file (item 1 of argv)
  set outputFile to POSIX file (item 2 of argv)
  tell application "Numbers"
    set theDocument to open inputFile
    export theDocument to outputFile as Microsoft Excel
    close theDocument saving no
  end tell
end run
APPLESCRIPT

alskai-notebank import "$output_file" --json
)
```

The `EXIT` trap removes the temporary export after the import command finishes or fails.

## Interpret results

- Parse the single JSON document on stdout even when the exit code is `1`; stderr contains progress and diagnostics only.
- Single `saved`: report `result.savedFile`.
- Single `skipped` with `result.reason: "SOURCE_URL_EXISTS"`: report the existing `result.savedFile` as a normal idempotent result, not an error.
- Single `failed`: report `error.code` and `error.message` without claiming success.
- Workbook import: report every `result.items` entry in input order, including its row number, status, saved file or failure reason. A `partial` result exits `1` but still contains successful and skipped items.
- Multiple direct URLs: aggregate the individual JSON results in input order and report saved, skipped, and failed counts.

## Decide whether to continue

Apply this priority after reporting the archive result:

1. If the user explicitly says “only save,” stop regardless of `result.autoProcess`.
2. If the user explicitly requests saving and processing, hand each successfully saved file to the separate processing route. Use a processing goal stated in the current request; only when the request omits one, fall back to `result.processingGoal`.
3. Otherwise, stop when `result.autoProcess` is `false`; when it is `true`, use the same processing handoff.

For workbook results, `autoProcess` and `processingGoal` are fields of `result`, and only `result.items` with status `saved` are eligible for the handoff. For multiple direct URLs, apply the decision to each result. Do not implement processing or load review instructions in this archive reference.
