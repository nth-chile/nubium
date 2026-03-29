You are running the test matrix generator for the Notation app. Do this autonomously — do NOT ask the user questions.

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

## Step 5: Output

Print a summary table:
```
Feature | Type | Unit | E2E | Notes
--------|------|------|-----|------
```

Then print a **Manual Testing Checklist** — only things that cannot be automated. Keep it short and actionable.

Finally, report the test count before and after.
