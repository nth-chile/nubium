import type { Command, EditorSnapshot } from "./Command";
import { factory } from "../model";

export class DeleteMeasure implements Command {
  description = "Delete measure";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Don't delete the last measure
    const maxMeasures = Math.max(...score.parts.map((p) => p.measures.length));
    if (maxMeasures <= 1) return state;

    // Delete from all parts
    for (const part of score.parts) {
      if (measureIndex < part.measures.length) {
        part.measures.splice(measureIndex, 1);
      }
      if (part.measures.length === 0) {
        part.measures.push(factory.measure([factory.voice([])]));
      }
    }

    // Adjust cursor
    const cursorPart = score.parts[input.cursor.partIndex];
    if (cursorPart && input.cursor.measureIndex >= cursorPart.measures.length) {
      input.cursor.measureIndex = cursorPart.measures.length - 1;
    }
    input.cursor.eventIndex = 0;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
