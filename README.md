# Notation

Notate music, or ask your favorite AI model to.

## Philosophy

Inspired by [Obsidian](https://obsidian.md), Notation is extremely flexible. Turn off all the features you don't want, turn on what you want, and drag the UI around to wherever you want it to be. Notation supports community plugins, or ask me to ask Claude do it.

## Getting Started

```
claude -p "add my feature and submit pr please"
```

## Clean Settings

Test as a fresh install without affecting your saved settings:

```
VITE_CLEAN_SETTINGS=1 npm run dev
VITE_CLEAN_SETTINGS=1 npm run tauri dev
```

### Claude Code Skills

- `/test-changes` — After a feature or bug fix, finds untested changes, writes unit tests, and creates/updates GitHub issues (label: `manual-test`) for anything requiring manual verification.
- `/test-matrix` — Comprehensive scan of all features vs test coverage. Writes missing unit tests and creates GitHub issues for manual-only items.
- `/triage-issues` — Scans open and recently-closed issues for unaddressed items in comments. Splits compound issues, deduplicates, links related issues, and labels questions/design choices with `needs-decision`.

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
