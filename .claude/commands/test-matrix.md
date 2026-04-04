You are running the test matrix generator for the Nubium app. Do this autonomously — do NOT ask the user questions.

## Step 1: Feature Inventory

Scan the codebase to build a complete feature list:

1. **Commands**: Read every file in `src/commands/` — each class is a command
2. **Plugins**: Read every file in `src/plugins/` — each exported plugin object and its registered commands
3. **Keyboard shortcuts**: Read `src/components/KeyboardShortcuts.tsx` for all keybindings
4. **Views**: Read `src/plugins/Views.ts` for registered views
5. **AI features**: Read `src/ai/` for chat, diff/apply, context building
6. **Playback**: Read `src/playback/` for transport, playback order
7. **File I/O**: Read `src/fileio/` for save, load, PDF export
8. **UI components**: Read `src/components/` for interactive components (settings, overlays, panels)

## Step 2: Test Inventory

Find all test files:
- `src/**/__tests__/*.test.ts` (unit tests)
- `e2e/*.spec.ts` (Playwright E2E tests)

For each test file, list what features/commands it covers.

## Step 3: Gap Analysis

Cross-reference Step 1 and Step 2. For each feature, classify:
- **Unit tested**: Has dedicated unit test assertions
- **E2E tested**: Has Playwright test coverage
- **Untested**: No test coverage at all
- **Manual only**: Cannot be automated (canvas rendering, audio, drag-and-drop)

## Step 4: Write Missing Unit Tests

For any feature marked "Untested" that CAN be unit tested (pure logic, command execution, serialization), write the tests. Follow existing patterns in `src/commands/__tests__/phase2.test.ts`.

Run `npm run test` after writing to verify they pass.

## Step 5: GitHub Issues for Manual Tests

For features marked "Manual only" or "Untested" that cannot be unit tested:

1. First check existing issues: `gh issue list --label manual-test --state open --limit 100`
2. If an existing open issue already covers this feature, **add a comment** noting it was identified in the test matrix scan. Use `gh issue comment <number> --body "..."`.
3. If no existing issue covers it, **create a new issue** with label `manual-test`. Include clear steps, expected behavior, and what to look for.
4. Do NOT create duplicates.

## Step 6: Output

Print a summary table:
```
Feature | Type | Unit | E2E | Manual Issue | Notes
--------|------|------|-----|-------------|------
```

Then report:
- Test count before and after
- GitHub issues created or updated (with links)
- Overall coverage assessment
