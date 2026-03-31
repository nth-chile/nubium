You are reviewing this conversation before it ends. Work autonomously except where noted.

## Goal

Extract lasting value from this conversation by saving important context to memory and suggesting new skills.

## Step 1: Review the Conversation

Look back through the entire conversation and identify:

1. **User preferences or corrections** — Did the user correct your approach, express a preference, or confirm something non-obvious? Save as `feedback` memory.
2. **User info** — Did you learn anything new about the user's role, expertise, or goals? Save as `user` memory.
3. **Project context** — Did you learn about ongoing work, decisions, deadlines, or motivation that isn't in the code? Save as `project` memory.
4. **External references** — Did the user mention external tools, dashboards, docs, or tracking systems? Save as `reference` memory.

For each item, check `/Users/jared/.claude/projects/-Users-jared-work-notation/memory/MEMORY.md` first — update existing memories rather than creating duplicates.

## Step 2: Check for Loose Ends

Re-read the conversation and look for anything the user asked about or mentioned that never got addressed — questions that were skipped, requests that got lost in a larger task, side comments that deserved a response, or partially completed work. List anything you find and ask the user if they want to address them now.

## Step 3: Suggest New Skills

Review the conversation for repeated workflows or patterns that could be automated with a new skill. Consider:

- Did the user do something multi-step that they'll likely do again?
- Was there a workflow that required manual coordination between tools?
- Did the user express a wish like "it would be nice if..." or "I always have to..."?

If you identify a candidate, suggest it to the user with a brief description of what it would do. Don't create it unless they agree.

## Step 4: Update the README

Check if `/convo-review` is listed in the Claude Code Skills section of `README.md`. If not, add it. Keep the entry format consistent with the existing entries.

## Guidelines

- Only save memories that will be useful in **future** conversations — not ephemeral task details.
- Don't save things derivable from code, git history, or CLAUDE.md.
- Be selective — a conversation with nothing worth remembering should produce no memories.
- When saving, convert relative dates to absolute dates.
- Lead with action, not explanation. Save memories and report what you saved.
- **Be terse.** Only mention a step if it produced something actionable. Skip steps where there's nothing to report — don't say "nothing found" or "all good".
