import type { Command, EditorSnapshot } from "./Command";
import type { Clef } from "../model";

export class ChangeClef implements Command {
  description = "Change clef";

  constructor(private clef: Clef) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    if (!measure) return state;

    measure.clef = { ...this.clef };

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
