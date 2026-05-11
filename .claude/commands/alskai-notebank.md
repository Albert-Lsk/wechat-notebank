Archive WeChat public account articles with the local `alskai-notebank` CLI.

Arguments:

```text
$ARGUMENTS
```

Use this command as a thin wrapper around the CLI. Do not reimplement fetching or parsing.

Steps:

1. Verify `alskai-notebank` is installed:
   ```bash
   command -v alskai-notebank
   ```
2. If arguments start with `import` and the file ends with `.numbers`, export it to a temporary `.xlsx` with macOS Numbers, then run:
   ```bash
   alskai-notebank import <exported.xlsx>
   ```
3. If arguments start with `import` and the file is already Excel, run:
   ```bash
   alskai-notebank $ARGUMENTS
   ```
4. Otherwise treat the arguments as a single-article archive request and run:
   ```bash
   alskai-notebank $ARGUMENTS
   ```
5. Summarize saved files, skipped rows, and failures from the CLI output.

Never perform WeChat account interactions such as liking, favoriting, or commenting.
