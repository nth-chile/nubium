import type { Command, EditorSnapshot } from "./Command";
import { newId, type MeasureId, type VoiceId } from "../model/ids";
import type { Measure } from "../model";

export class InsertMeasure implements Command {
  description = "Insert measure";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Insert a new measure after the current one in all parts
    for (const part of score.parts) {
      const currentMeasure = part.measures[Math.min(measureIndex, part.measures.length - 1)];
      const newMeasure: Measure = {
        id: newId<MeasureId>("msr"),
        clef: { ...currentMeasure.clef },
        timeSignature: { ...currentMeasure.timeSignature },
        keySignature: { ...currentMeasure.keySignature },
        barlineEnd: "single",
        annotations: [],
        voices: currentMeasure.voices.map((v) => ({ id: newId<VoiceId>("vce"), events: [], staff: v.staff })),
      };
      part.measures.splice(measureIndex + 1, 0, newMeasure);
    }

    // Move cursor to the new measure
    input.cursor.measureIndex = measureIndex + 1;
    input.cursor.eventIndex = 0;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
