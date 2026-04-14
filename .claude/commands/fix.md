You are fixing a user-reported problem for the Nubium app. Do this autonomously — do NOT ask the user questions.

The user's problem description: $ARGUMENTS

## Step 1: Create GitHub Issue

1. Search for existing issues that match: `gh issue list --state open --search "keyword"`
2. If no duplicate exists, create a new issue: `gh issue create --title "..." --body "..."`
3. Note the issue number

## Step 2: Analyze

1. Find the relevant code
2. Determine root cause
3. If the reported behavior is actually correct, explain why and comment on the GitHub issue — stop here

## Step 3: Fix

1. Read all relevant code before modifying
2. Make the minimal correct fix
3. Run `npm run test` to make sure nothing breaks

## Step 4: Write Tests

Write unit tests that cover the fix:
1. Find the appropriate test file (or create one next to the source file)
2. Add tests that would have caught the bug
3. Run `npm run test` to confirm they pass

## Step 5: Comment on Issue

Comment on the GitHub issue with:
- What was fixed and why
- Clear steps for the user to verify the fix (what to do in the app, what to look for)

Format: `gh issue comment <number> --body "..."`

## Step 6: Commit

Stage and commit the changes with a message referencing the issue number.

## Guidelines

- Work directly on main
- Reference Dorico for UX behavior decisions
- Don't force fixes — push back when current behavior is correct
- Keep the fix minimal and clean
