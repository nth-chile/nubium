import type { Command, EditorSnapshot } from "./Command";

export class DeleteMeasure implements Command {
  description = "Delete measure";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const part = score.parts[partIndex];
    if (!part) return state;

    // Don't delete the last measure
    if (part.measures.length <= 1) return state;

    // Only delete if measure is empty (all voices have no events)
    const measure = part.measures[measureIndex];
    const isEmpty = measure.voices.every((v) => v.events.length === 0);
    if (!isEmpty) return state;

    part.measures.splice(measureIndex, 1);

    // Adjust cursor
    if (input.cursor.measureIndex >= part.measures.length) {
      input.cursor.measureIndex = part.measures.length - 1;
    }
    input.cursor.eventIndex = 0;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
