# Setup and doctor

Use this route only for installation, update, diagnosis, or Agent integration repair. The supported setup/doctor environment is macOS Apple Silicon with Node.js 20+, npm, and Google Chrome.

## Install or update

For initial installation, follow the repository README's fixed `v0.2.0` GitHub Release instructions. Do not install from a moving branch or run an extra remote script.

Ask which integrations the user wants. Never infer this in JSON mode. Use exactly one explicit target:

```text
alskai-notebank setup --agents <codex|claude|codex,claude> [--dry-run] --json
```

Use `--dry-run` when the user asks to preview Agent-file writes. It does not preview the separate npm CLI installation. On success, report each action and tell the user to restart Codex and/or Claude Code. Repeating setup is safe; the CLI owns comparison, backup, transaction, and recovery.

## Diagnose

Run:

```text
alskai-notebank doctor --json
```

Treat `failed` checks and their stable error codes as blockers. Treat missing Agent integrations or knowledge-base configuration as warnings when they are outside the user's requested scope. Report the CLI result; do not recreate platform, dependency, configuration, directory, or version checks manually.

If the requested Agent integration passes but the current session still cannot discover it, tell the user to restart that Agent. Do not inspect repository internals to invent another diagnosis.

## Boundaries

- The CLI installs bundled Agent files only. `init` configures the knowledge base separately.
- Do not modify shell startup files, bypass platform security, install system dependencies, or inspect secrets.
- JSON stdout is the machine result. Do not parse human logs or inspect repository internals to second-guess it.
