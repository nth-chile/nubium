/**
 * Test AI tool use with Gemini Flash.
 * Run: GEMINI_API_KEY=... npx tsx scripts/test-ai-tools.ts
 */

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("Set GEMINI_API_KEY env var"); process.exit(1); }
const MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a musician and arranger editing a music score. You MUST use tools for every request. Never respond with only text — always call a tool.

Rules:
1. If the user asks to change the score, call patch_score or replace_score immediately. Do NOT say "I'll do that" without calling a tool.
2. If the user says you didn't do something, call get_score to check, then fix it with patch_score.
3. Write actual notes and music — don't create empty parts with just rests.
4. Keep text responses to one sentence. The user can see the score.
5. Make musical judgment calls rather than asking for clarification.`;

const SCORE_CONTEXT = `Here is the current score:

\`\`\`json
{
  "formatVersion": 1,
  "title": "Test",
  "composer": "",
  "tempo": 120,
  "parts": [
    {
      "name": "Piano",
      "abbreviation": "Pia",
      "instrument": "piano",
      "measures": [
        {
          "number": 1,
          "time": "4/4",
          "key": 0,
          "clef": "treble",
          "annotations": [],
          "voices": [{ "voice": 1, "events": [{ "type": "rest", "duration": "whole" }] }]
        },
        {
          "number": 2,
          "time": "4/4",
          "key": 0,
          "clef": "treble",
          "annotations": [],
          "voices": [{ "voice": 1, "events": [{ "type": "rest", "duration": "whole" }] }]
        },
        {
          "number": 3,
          "time": "4/4",
          "key": 0,
          "clef": "treble",
          "annotations": [],
          "voices": [{ "voice": 1, "events": [{ "type": "rest", "duration": "whole" }] }]
        },
        {
          "number": 4,
          "time": "4/4",
          "key": 0,
          "clef": "treble",
          "annotations": [],
          "voices": [{ "voice": 1, "events": [{ "type": "rest", "duration": "whole" }] }]
        }
      ]
    }
  ]
}
\`\`\``;

// Simplified tool definitions matching what the app sends
const TOOLS = [{
  functionDeclarations: [
    {
      name: "execute_command",
      description: "Execute a registered app command for mechanical tasks (transpose, toggle views, articulations, etc.). Commands: nubium.toggle-standard: Toggle standard notation, nubium.toggle-tab: Toggle tab notation, nubium.toggle-slash: Toggle slash notation, nubium.undo: Undo, nubium.redo: Redo, nubium.insert-measure: Insert measure, nubium.delete-measure: Delete measure",
      parameters: {
        type: "OBJECT",
        properties: {
          command_id: { type: "STRING", description: "The command ID to execute" },
        },
        required: ["command_id"],
      },
    },
    {
      name: "patch_score",
      description: "Apply targeted edits to specific measures. Use for creative musical edits: composing, arranging, harmonizing, adding chord symbols, writing melodies. Also use to change tempo, title, or composer via score_metadata.",
      parameters: {
        type: "OBJECT",
        properties: {
          patches: {
            type: "ARRAY",
            description: "Array of measure patches",
            items: {
              type: "OBJECT",
              properties: {
                part: { type: "INTEGER", description: "Part index (0-based)" },
                measure: { type: "INTEGER", description: "Measure number (1-based)" },
                data: { type: "OBJECT", description: "Complete measure data" },
              },
              required: ["part", "measure", "data"],
            },
          },
          score_metadata: {
            type: "OBJECT",
            description: "Optional score-level changes (title, composer, tempo)",
            properties: {
              title: { type: "STRING" },
              composer: { type: "STRING" },
              tempo: { type: "NUMBER" },
            },
          },
        },
        required: ["patches"],
      },
    },
    {
      name: "replace_score",
      description: "Replace the entire score. Use for structural changes like adding/removing parts.",
      parameters: {
        type: "OBJECT",
        properties: {
          score: { type: "OBJECT", description: "Complete score object" },
        },
        required: ["score"],
      },
    },
    {
      name: "get_score",
      description: "Get the current score as JSON.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "get_selection",
      description: "Get the current selection.",
      parameters: { type: "OBJECT", properties: {} },
    },
  ],
}];

interface TestCase {
  prompt: string;
  expectTool: string | null; // null = no tool expected (conversational)
  description: string;
}

const TESTS: TestCase[] = [
  // patch_score tests
  { prompt: "add a C quarter note to measure 1", expectTool: "patch_score", description: "Add a note" },
  { prompt: "add chord symbols Dm7, G7, Cmaj7, Am7 to measures 1-4", expectTool: "patch_score", description: "Add chord symbols" },
  { prompt: "set the tempo to 140", expectTool: "patch_score", description: "Change tempo" },
  { prompt: "write a simple melody in C major", expectTool: "patch_score", description: "Write a melody" },
  { prompt: "add lyrics 'hel-lo world' to measure 1", expectTool: "patch_score", description: "Add lyrics" },
  { prompt: "change the title to 'My Song'", expectTool: "patch_score", description: "Change title" },

  // replace_score tests
  { prompt: "add a guitar part", expectTool: "replace_score", description: "Add a part" },
  { prompt: "add a bass part with a walking bass line", expectTool: "replace_score", description: "Add part with notes" },

  // execute_command tests
  { prompt: "show tab notation", expectTool: "execute_command", description: "Show tabs" },
  { prompt: "toggle tab view", expectTool: "execute_command", description: "Toggle tab" },
  { prompt: "show slash notation", expectTool: "execute_command", description: "Show slash" },
  { prompt: "insert a new measure", expectTool: "execute_command", description: "Insert measure" },
  { prompt: "undo", expectTool: "execute_command", description: "Undo" },
  { prompt: "transpose up a half step", expectTool: "execute_command", description: "Transpose" },

  // get_score tests
  { prompt: "what notes are in the score?", expectTool: "get_score", description: "Read score" },

  // Natural language variations
  { prompt: "make it longer", expectTool: "patch_score", description: "Vague: make longer" },
  { prompt: "add some dynamics", expectTool: "patch_score", description: "Add dynamics" },
  { prompt: "put an accent on beat 1", expectTool: "patch_score", description: "Add articulation" },
  { prompt: "change it to 3/4 time", expectTool: "patch_score", description: "Change time sig" },
  { prompt: "set the key to G major", expectTool: "patch_score", description: "Change key sig" },
  { prompt: "delete measure 2", expectTool: "execute_command", description: "Delete measure" },

  // Conversational (text only is acceptable)
  { prompt: "what key is this in?", expectTool: null, description: "Conversational question" },
  { prompt: "how many measures are there?", expectTool: null, description: "Count measures" },
];

async function callGemini(prompt: string): Promise<{ toolCalls: string[]; text: string; raw: unknown }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + "\n\n" + SCORE_CONTEXT }] },
    tools: TOOLS,
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { maxOutputTokens: 8192 },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: unknown } }> };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const toolCalls = parts
    .filter((p: { functionCall?: unknown }) => p.functionCall)
    .map((p: { functionCall?: { name: string } }) => p.functionCall!.name);
  const text = parts
    .filter((p: { text?: string }) => p.text)
    .map((p: { text?: string }) => p.text)
    .join("");

  return { toolCalls, text, raw: data };
}

async function runTests() {
  console.log("Testing AI tool use with Gemini Flash\n");
  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    process.stdout.write(`  ${test.description}... `);

    try {
      const result = await callGemini(test.prompt);
      const calledTools = result.toolCalls;

      if (test.expectTool === null) {
        // Conversational — any response is fine
        console.log(`PASS (${calledTools.length > 0 ? "tools: " + calledTools.join(", ") : "text only"})`);
        passed++;
      } else if (calledTools.includes(test.expectTool)) {
        console.log(`PASS (called ${calledTools.join(", ")})`);
        passed++;
      } else if (calledTools.length > 0) {
        // Called a different tool — might be acceptable
        const acceptable =
          (test.expectTool === "patch_score" && calledTools.includes("replace_score")) ||
          (test.expectTool === "replace_score" && calledTools.includes("patch_score")) ||
          calledTools.includes("get_score"); // reading first is ok
        if (acceptable) {
          console.log(`PASS (called ${calledTools.join(", ")} instead of ${test.expectTool})`);
          passed++;
        } else {
          console.log(`FAIL — expected ${test.expectTool}, got ${calledTools.join(", ")}`);
          failed++;
        }
      } else {
        console.log(`FAIL — expected ${test.expectTool}, got text only: "${result.text.substring(0, 80)}"`);
        failed++;
      }

      // Rate limit: Gemini free tier is 15 RPM
      await new Promise((r) => setTimeout(r, 4500));
    } catch (err) {
      console.log(`ERROR — ${(err as Error).message.substring(0, 100)}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${TESTS.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
