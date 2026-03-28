import type { Command, EditorSnapshot } from "./Command";
import type { TimeSignature } from "../model";

export class ChangeTimeSig implements Command {
  description = "Change time signature";

  constructor(private timeSignature: TimeSignature) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    if (!measure) return state;

    measure.timeSignature = { ...this.timeSignature };

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
