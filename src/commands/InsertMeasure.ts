import type { Command, EditorSnapshot } from "./Command";
import { newId, type MeasureId, type VoiceId } from "../model/ids";
import type { Measure } from "../model";

export class InsertMeasure implements Command {
  description = "Insert measure";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const part = score.parts[partIndex];
    if (!part) return state;

    // Copy time sig, clef, key sig from current measure
    const currentMeasure = part.measures[measureIndex];
    const newMeasure: Measure = {
      id: newId<MeasureId>("msr"),
      clef: { ...currentMeasure.clef },
      timeSignature: { ...currentMeasure.timeSignature },
      keySignature: { ...currentMeasure.keySignature },
      barlineEnd: "single",
      voices: [{ id: newId<VoiceId>("vce"), events: [] }],
    };

    // Insert after current measure
    part.measures.splice(measureIndex + 1, 0, newMeasure);

    // Move cursor to the new measure
    input.cursor.measureIndex = measureIndex + 1;
    input.cursor.eventIndex = 0;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
