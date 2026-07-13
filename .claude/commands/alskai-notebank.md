使用本地 `alskai-notebank` CLI，把值得保留的微信公众号文章归档为本地 Markdown，沉淀到 Obsidian、Logseq 或普通文件夹。

Arguments:

```text
$ARGUMENTS
```

将这个命令作为 CLI 的轻量入口。不要在命令层重新实现抓取或解析。

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
