# Content processing

Load this reference when the user explicitly asks to process an existing L1 article, or when the archive route hands off a saved or idempotently skipped article because processing is enabled.

Use the installed `alskai-notebank` CLI for deterministic pack creation. The Agent owns article understanding and candidate generation; the CLI owns Manifest validation, pack identity, revisions, state, files, and links.

## Accept the archive handoff

Accept one of these explicit inputs:

- For a single fetch, use `result.savedFile` and `result.sourceUrl`. A `skipped` result with `SOURCE_URL_EXISTS` is eligible only after an explicit processing request; implicit `autoProcess` handles newly `saved` results only.
- For a workbook handoff, use each eligible `item.savedFile` and `item.sourceUrl` while taking the shared goal and auto-process setting from the parent result.
- For a direct request to process an existing L1 file, use the absolute path supplied by the user and its Frontmatter `sourceUrl`.

Do not process failed items, and do not search the vault to guess an article the user did not identify. A duplicate archive result can reuse an existing pack, create a different pack for a new goal, or create a new revision when candidate content changes; let `pack create` decide.

For a direct existing L1 request, let the CLI resolve configuration before generating candidates. Read its Frontmatter `sourceUrl`, set the output folder to the existing file's parent, and run:

```text
alskai-notebank fetch "<sourceUrl>" --output "<existing L1 parent folder>" --json
```

Require an idempotent `skipped` result whose `result.savedFile` resolves to the user-supplied file. Then use that result as the handoff, including `result.processingGoal`; if identity differs or fetch fails, stop instead of processing a different file.

An existing L1 therefore inherits `result.processingGoal` from the CLI unless the current request overrides it.

Resolve the effective goal before reading the article:

1. A processing goal stated in the current request takes precedence over `result.processingGoal`, including a request for general processing with no specialized goal.
2. Otherwise use `result.processingGoal`.
3. If neither supplies a goal, use `null` and stay general. Never infer the user's identity, profession, or intended audience.

If the user explicitly said to only save, stop instead of processing even if this route was loaded accidentally. Do not re-read configuration files; the archive JSON already reports the resolved configuration.

## Generate Manifest v1

Read the saved source article and create one temporary JSON document with exactly these top-level fields:

```json
{
  "schemaVersion": 1,
  "sourceFile": "/absolute/path/from/result.savedFile",
  "sourceUrl": "https://mp.weixin.qq.com/s/example",
  "processingGoal": null,
  "atomicNotes": [],
  "materials": [],
  "reviewQuestions": []
}
```

Generate only useful candidates; any candidate array may be empty.

- `atomicNotes` are L2 candidates. Number them contiguously as `L2-01`, `L2-02`, and so on. Each item has only `id`, `title`, `claim`, `evidence`, `boundary`, and string-array `useCases`.
- `materials` are L3 candidates. Number them contiguously as `L3-01`, `L3-02`, and so on. Each item has only `id`, `kind`, `title`, `content`, and `sourceSection`; `kind` is `quote`, `paraphrase`, `case`, or `data`. For `quote`, copy content exactly and verbatim from the source article. Use another kind for every summary or rewrite.
- `reviewQuestions` are L4 prompts. Number them contiguously as `L4-Q01`, `L4-Q02`, and so on. Each item has only `id` and `question`. The initial Manifest must not include `reviewAnswers` or `reviewDraft`.

First identify plausible general uses of the article, then apply the effective processing goal when one exists. Keep source facts distinct from Agent interpretations. Do not manufacture candidates to fill a category.

## Create the pending pack

Write the Manifest to a temporary file, then run exactly one JSON command:

```text
alskai-notebank pack create --source "<absolute source path>" --manifest "<temporary manifest.json>" --json
```

Parse the single JSON document on stdout even when the command exits `1`; report the stable error code and message on failure. On `created`, `revised`, or `unchanged`, hand `result.packFile` and `result.stateFile` to the review route, then remove the temporary Manifest. The state file is the machine source of truth for resuming review; never edit it directly.

`pack create` produces a pending review/approval package. It does not publish L2, L3, or L4. Do not call approval, rejection, or revocation commands from this route. Report the candidate IDs and processing goal, then hand the pack to the separate review route.
