/**
 * AI tool definitions and executor.
 * Tools are built dynamically from the command registry so they auto-sync
 * with app features as plugins register new commands.
 */

import type { ToolDefinition } from "../ChatProvider";
import { getGlobalPluginManager } from "../../plugins/PluginManager";
import { useEditorStore } from "../../state";
import { scoreToAIJson } from "../../serialization";
import { applyAIEdit } from "../DiffApply";

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  callId: string;
  content: string;
  isError?: boolean;
}

/**
 * Build the full set of tool definitions for the AI.
 * Called each time a message is sent so the command list is always current.
 */
export function buildToolDefinitions(): ToolDefinition[] {
  return [
    buildExecuteCommandTool(),
    buildPatchScoreTool(),
    buildReplaceScoreTool(),
    buildGetScoreTool(),
    buildGetSelectionTool(),
  ];
}

/**
 * Execute a tool call and return the result.
 */
export function executeTool(call: ToolCallRequest): ToolCallResult {
  try {
    switch (call.name) {
      case "execute_command":
        return executeCommand(call);
      case "patch_score":
        return executePatchScore(call);
      case "replace_score":
        return executeReplaceScore(call);
      case "get_score":
        return executeGetScore(call);
      case "get_selection":
        return executeGetSelection(call);
      default:
        return { callId: call.id, content: JSON.stringify({ error: `Unknown tool: ${call.name}` }), isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { callId: call.id, content: JSON.stringify({ error: message }), isError: true };
  }
}

// --- Tool definitions ---

function buildExecuteCommandTool(): ToolDefinition {
  // Commands that open dialogs/popovers — AI can't interact with those
  const dialogCommands = new Set([
    "nubium.tempo", "nubium.time-signature", "nubium.key-signature",
    "nubium.dynamics", "nubium.rehearsal-mark", "nubium.barline",
    "nubium.navigation-marks", "nubium.chord-mode", "nubium.go-to-measure",
    "nubium.file-history",
  ]);

  const pm = getGlobalPluginManager();
  const filteredCommands = pm?.getCommands()
    .filter((c) => !c.id.endsWith(".toggle") && !c.id.startsWith("nubium.play") && !c.id.startsWith("nubium.pause") && !c.id.startsWith("nubium.stop"))
    .filter((c) => !dialogCommands.has(c.id)) ?? [];

  const commandIds = filteredCommands.map((c) => c.id);
  const commandSummary = filteredCommands.map((c) => `${c.id}: ${c.label}`).join(", ");

  return {
    name: "execute_command",
    description: `Execute a registered app command for mechanical tasks (transpose, toggle views, articulations, etc.). Commands: ${commandSummary}`,
    inputSchema: {
      type: "object",
      properties: {
        command_id: { type: "string", description: "The command ID to execute", enum: commandIds },
      },
      required: ["command_id"],
    },
  };
}

function buildPatchScoreTool(): ToolDefinition {
  return {
    name: "patch_score",
    description: `Apply targeted edits to specific measures. Use this for creative musical work: composing, arranging, adding chord symbols, writing melodies/bass lines, etc.

Each patch targets a specific part and measure. The data object replaces that measure entirely.

Measure format: { number, time: "4/4", key: 0, clef: "treble", annotations: [...], voices: [{ voice: 1, events: [...] }] }
Note: { "type": "note", "pitch": "C4", "duration": "quarter" } — accidentals: "accidental": "sharp"|"flat"
Chord: { "type": "chord", "pitches": ["C4","E4","G4"], "duration": "half" }
Rest: { "type": "rest", "duration": "quarter" }
Chord symbol: { "type": "chord", "beat": 0, "symbol": "Cmaj7" } in annotations
Pitches: Letter + octave + optional accidental suffix (C4, F4#, Bb3).
Durations: "whole", "half", "quarter", "eighth", "16th", "32nd", "64th". Dotted: append ".".
Ticks: whole=1920, half=960, quarter=480, eighth=240, 16th=120. Dotted=×1.5. Measure must fill exactly (4/4=1920 ticks).
Keys (fifths): -2=Bb, -1=F, 0=C, 1=G, 2=D.

You can also update score-level metadata via the score_metadata parameter. Use this to change tempo, title, or composer — there is no command for these, you must use this tool.`,
    inputSchema: {
      type: "object",
      properties: {
        patches: {
          type: "array",
          description: "Array of measure patches to apply",
          items: {
            type: "object",
            properties: {
              part: { type: "integer", description: "Part index (0-based)" },
              measure: { type: "integer", description: "Measure number (1-based)" },
              data: { type: "object", description: "Complete measure data" },
            },
            required: ["part", "measure", "data"],
          },
        },
        score_metadata: {
          type: "object",
          description: "Optional score-level changes",
          properties: {
            title: { type: "string" },
            composer: { type: "string" },
            tempo: { type: "number" },
          },
        },
      },
      required: ["patches"],
    },
  };
}

function buildReplaceScoreTool(): ToolDefinition {
  return {
    name: "replace_score",
    description: `Replace the entire score. Use this for structural changes like adding/removing parts, or large rewrites. The score object should include title, tempo, and all parts with their measures.

Instruments: piano, guitar, bass, violin, viola, cello, flute, clarinet, trumpet, drums, alto-sax, tenor-sax.`,
    inputSchema: {
      type: "object",
      properties: {
        score: {
          type: "object",
          description: "Complete score object with title, tempo, parts array",
        },
      },
      required: ["score"],
    },
  };
}

function buildGetScoreTool(): ToolDefinition {
  return {
    name: "get_score",
    description: "Get the current score as JSON. Use this to refresh your view of the score if you've made changes or the conversation is long.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  };
}

function buildGetSelectionTool(): ToolDefinition {
  return {
    name: "get_selection",
    description: "Get the current selection (which part and measures are selected). Returns null if nothing is selected.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  };
}

// --- Tool executors ---

function executeCommand(call: ToolCallRequest): ToolCallResult {
  const commandId = call.arguments.command_id as string;
  const pm = getGlobalPluginManager();
  if (!pm) {
    return { callId: call.id, content: JSON.stringify({ error: "Plugin manager not available" }), isError: true };
  }
  const success = pm.executeCommand(commandId);
  if (!success) {
    return { callId: call.id, content: JSON.stringify({ error: `Command not found: ${commandId}` }), isError: true };
  }
  return { callId: call.id, content: JSON.stringify({ success: true, command: commandId }) };
}

function executePatchScore(call: ToolCallRequest): ToolCallResult {
  const patches = call.arguments.patches as Record<string, unknown>[];
  const scoreMeta = call.arguments.score_metadata as Record<string, unknown> | undefined;

  // Build the JSON format that applyAIEdit expects
  const editJson: Record<string, unknown> = {
    patch: patches,
  };
  if (scoreMeta) {
    editJson.score = scoreMeta;
  }

  const currentScore = useEditorStore.getState().score;
  const result = applyAIEdit(currentScore, JSON.stringify(editJson));

  if (result.ok) {
    useEditorStore.getState().setScore(result.score);
    const measureNums = patches.map((p) => p.measure as number);
    const unique = [...new Set(measureNums)].sort((a, b) => a - b);
    return {
      callId: call.id,
      content: JSON.stringify({ success: true, measuresChanged: unique }),
    };
  }

  if ("validationErrors" in result) {
    return { callId: call.id, content: JSON.stringify({ error: "Validation failed", details: result.validationErrors }), isError: true };
  }
  return { callId: call.id, content: JSON.stringify({ error: ("error" in result ? result.error : "Unknown error") }), isError: true };
}

function executeReplaceScore(call: ToolCallRequest): ToolCallResult {
  const scoreData = call.arguments.score as Record<string, unknown>;
  const currentScore = useEditorStore.getState().score;
  const result = applyAIEdit(currentScore, JSON.stringify(scoreData));

  if (result.ok) {
    useEditorStore.getState().setScore(result.score);
    return { callId: call.id, content: JSON.stringify({ success: true, parts: result.score.parts.length, measures: result.score.parts[0]?.measures.length ?? 0 }) };
  }

  if ("validationErrors" in result) {
    return { callId: call.id, content: JSON.stringify({ error: "Validation failed", details: result.validationErrors }), isError: true };
  }
  return { callId: call.id, content: JSON.stringify({ error: ("error" in result ? result.error : "Unknown error") }), isError: true };
}

function executeGetScore(call: ToolCallRequest): ToolCallResult {
  const score = useEditorStore.getState().score;
  const json = scoreToAIJson(score);
  return { callId: call.id, content: JSON.stringify(json) };
}

function executeGetSelection(call: ToolCallRequest): ToolCallResult {
  const state = useEditorStore.getState();
  if (state.selection) {
    return {
      callId: call.id,
      content: JSON.stringify({
        partIndex: state.selection.partIndex,
        measureStart: state.selection.measureStart,
        measureEnd: state.selection.measureEnd,
      }),
    };
  }
  return { callId: call.id, content: JSON.stringify(null) };
}
