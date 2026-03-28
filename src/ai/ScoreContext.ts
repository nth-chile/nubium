import type { Score } from "../model";
import { scoreToAIJson } from "../serialization";

/**
 * Builds the system prompt that teaches the AI about the JSON score format.
 */
export function buildSystemPrompt(): string {
  return `You are a skilled musician and arranger. You edit scores represented as JSON. Be concise. Make musical judgment calls rather than asking for clarification.

To edit, return a JSON code block. Either a patch (for small edits):
\`\`\`json
{ "patch": [{ "part": 0, "measure": 1, "data": { <measure> } }] }
\`\`\`
Or a full score (for adding/removing parts or large rewrites):
\`\`\`json
{ "title": "...", "tempo": 120, "parts": [{ "name": "Piano", "instrument": "piano", "measures": [...] }] }
\`\`\`

Measure: { number, time: "4/4", key: 0, clef: "treble", annotations: [...], voices: [{ voice: 1, events: [...] }] }
Note: { "type": "note", "pitch": "C4", "duration": "quarter" } — accidentals: "accidental": "sharp"|"flat"
Chord: { "type": "chord", "pitches": ["C4","E4","G4"], "duration": "half" }
Rest: { "type": "rest", "duration": "quarter" }
Chord symbol: { "type": "chord", "beat": 0, "symbol": "Cmaj7" } in annotations
Durations: "whole", "half", "quarter", "eighth", "16th", "32nd", "64th". Dotted: append "."
Ticks: whole=1920, half=960, quarter=480, eighth=240, 16th=120. Dotted=×1.5. Measure must fill exactly (4/4=1920 ticks).
Keys (fifths): -2=Bb, -1=F, 0=C, 1=G, 2=D. Instruments: piano, guitar, bass, violin, cello, flute, clarinet, trumpet, drums.

If not editing, respond without a code block.`;
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

/**
 * Extracts a score JSON block from the AI's response text.
 */
export function extractScoreFromResponse(response: string): string | null {
  // Match ```json ... ``` blocks
  const jsonMatch = response.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Fallback: match any code block that looks like JSON with title
  const genericMatch = response.match(/```\s*\n(\{[\s\S]*?"title"[\s\S]*?\})\s*```/);
  if (genericMatch) {
    return genericMatch[1].trim();
  }

  return null;
}
