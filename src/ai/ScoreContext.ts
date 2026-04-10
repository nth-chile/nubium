import type { Score } from "../model";
import { scoreToAIJson } from "../serialization";

/**
 * Builds the system prompt for the AI.
 * Simplified — tool descriptions now carry the format reference and command list.
 */
export function buildSystemPrompt(): string {
  return `You are a musician and arranger editing a music score. You MUST use tools for every request. Never respond with only text — always call a tool.

Rules:
1. If the user asks to change the score, call patch_score or replace_score immediately. Do NOT say "I'll do that" without calling a tool.
2. If the user says you didn't do something, call get_score to check, then fix it with patch_score.
3. Write actual notes and music — don't create empty parts with just rests.
4. Keep text responses to one sentence. The user can see the score.
5. Make musical judgment calls rather than asking for clarification.`;
}

/**
 * Serializes the score for inclusion in the AI context.
 */
export function buildScoreContext(
  score: Score,
  selection?: {
    partIndex: number;
    measureStart: number;
    measureEnd: number;
  }
): string {
  const json = scoreToAIJson(score);
  const jsonStr = JSON.stringify(json, null, 2);

  if (!selection) {
    return `Here is the current score:\n\n\`\`\`json\n${jsonStr}\n\`\`\``;
  }

  const part = score.parts[selection.partIndex];
  if (!part) {
    return `Here is the current score:\n\n\`\`\`json\n${jsonStr}\n\`\`\``;
  }

  return `Here is the current score:\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n\nFocus on Part "${part.name}", measures ${selection.measureStart + 1} through ${selection.measureEnd + 1}.`;
}
