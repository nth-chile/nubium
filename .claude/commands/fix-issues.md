You are fixing a group of related GitHub issues for the Notation app. Do this autonomously — do NOT ask the user questions, EXCEPT when confirming issue closure.

## Input

The user provides issue numbers (e.g., `#103 #122 #123`) or a description (e.g., "voice bugs"). If no numbers given, ask which group to work on.

## Step 1: Read All Issues

For each issue number:
1. Read the issue: `gh issue view <number> --json title,body`
2. Read all comments: `gh issue view <number> --comments`
3. Follow "Related: #X" links and read those too

Build a complete picture before writing any code.

## Step 2: Analyze Each Issue

For each issue, before coding:
1. Find the relevant code
2. Determine if the reported behavior is actually a bug or is correct
3. If you think the current behavior is correct, explain why and comment on the GitHub issue — but do NOT skip without the user's OK
4. For real bugs, identify the root cause

Present your analysis to the user: what you'll fix, what you think is correct as-is, and why.

## Step 3: Implement Fixes

Fix the real bugs:
1. Read all relevant code before modifying
2. Make the minimal correct fix
3. Run `npm run test` after each fix
4. Comment on each issue with what was fixed and clear test steps

## Step 4: Write Tests

Run `/test-changes` to write unit tests and update GitHub issues.

## Step 5: Confirm and Close

For EACH issue, ask the user to verify:
1. List what was fixed/changed for that issue
2. Point to the test steps in the GitHub comment
3. Wait for the user to confirm it works
4. Only close the issue after user confirmation: `gh issue close <number>`

Do NOT batch-close issues. Confirm each one individually.

## Guidelines

- Work directly on main (no feature branches)
- Reference Dorico for UX behavior decisions
- Don't force fixes — push back when current behavior is correct
- Comment on GitHub issues with your analysis and test steps
- Don't close issues without user confirmation
