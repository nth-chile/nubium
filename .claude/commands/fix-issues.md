You are fixing GitHub issues for the Nubium app. Do this autonomously — do NOT ask the user questions, EXCEPT when picking a group and confirming issue closure.

## Step 1: Triage

1. List all open issues: `gh issue list --state open --limit 100`
2. For each open issue, read its comments: `gh api repos/nth-chile/notation/issues/{number}/comments`
3. Check recently closed issues for new comments with unaddressed items: `gh issue list --state closed --limit 30`
4. Search for duplicates before creating anything: `gh issue list --state open --search "keyword"` and `gh issue list --state closed --search "keyword"`
5. Link related issues: add "Related: #X, #Y, #Z. Fix together." comments to issues that share a root cause or subsystem
6. Split compound issues: create sub-issues for untracked items found in comments, close fully-split parents with a comment listing the sub-issues
7. Label questions/design choices with `needs-decision`

## Step 2: Present Groups

Present the issue groups to the user:
- Group name (e.g., "Voice bugs", "Selection issues")
- Issue numbers and titles in each group
- Standalone issues that aren't part of a group

Ask the user which group to work on.

## Step 3: Read Issues

For each issue in the chosen group:
1. Read the issue: `gh issue view <number> --json title,body`
2. Read all comments: `gh issue view <number> --comments`
3. Follow "Related: #X" links and read those too

Build a complete picture before writing any code.

## Step 4: Analyze

For each issue, before coding:
1. Find the relevant code
2. Determine if the reported behavior is actually a bug or is correct
3. If you think the current behavior is correct, explain why and comment on the GitHub issue — but do NOT skip without the user's OK
4. For real bugs, identify the root cause

Present your analysis to the user: what you'll fix, what you think is correct as-is, and why.

## Step 5: Fix

Fix the real bugs:
1. Read all relevant code before modifying
2. Make the minimal correct fix
3. Run `npm run test` after each fix
4. Comment on each issue with what was fixed and clear test steps

## Step 6: Write Tests

Run `/test-changes` to write unit tests and update GitHub issues.

## Step 7: Confirm and Close

Walk the user through each fix one at a time:
1. Show what was fixed/changed and how to verify it
2. Wait for the user to say it looks good
3. Track which items within each issue are confirmed
4. If the issue has remaining unresolved items (from comments, sub-issues, etc.), say so: "That one's good, but this issue also has [X] — let me fix that next"
5. When the last item in an issue is confirmed, say "That's everything for #N, closing it" and close: `gh issue close <number>`
6. For compound issues that were split: when all sub-issues are closed, close the parent too with a comment listing them

## Guidelines

- Work directly on main (no feature branches)
- Reference Dorico for UX behavior decisions
- Don't force fixes — push back when current behavior is correct
- Comment on GitHub issues with your analysis and test steps
- Don't close issues without user confirmation
