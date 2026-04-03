# Notation

Notate music, or ask your favorite AI model to.

## Philosophy

Inspired by [Obsidian](https://obsidian.md), Notation is extremely flexible. Turn off all the features you don't want, turn on what you want, and drag the UI around to wherever you want it to be. Notation supports community plugins, or ask me to ask Claude do it.

## Getting Started

```
claude -p "add my feature and submit pr please"
```

## Test in both modes

Test in both browser and Tauri desktop when touching file I/O, settings, clipboard, or MIDI.

## Clean Settings

Test as a fresh install without affecting your saved settings:

```
VITE_CLEAN_SETTINGS=1 npm run dev
VITE_CLEAN_SETTINGS=1 npm run tauri dev
```

### Claude Code Skills

- `/fix-issues` — Triages all open issues (links related, splits compound, deduplicates), presents groups, then fixes the chosen group with tests.
- `/test-changes` — After a feature or bug fix, finds untested changes, writes unit tests, and creates/updates GitHub issues (label: `manual-test`) for anything requiring manual verification.
- `/test-matrix` — Comprehensive scan of all features vs test coverage. Writes missing unit tests and creates GitHub issues for manual-only items.
- `/convo-review` — End-of-conversation review. Saves important context to memory, surfaces loose ends that got ignored, suggests new skills for repeated workflows, and keeps the README up to date.

## License

AGPL-3.0 — see [LICENSE](LICENSE) for details.
