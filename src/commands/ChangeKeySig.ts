import type { Command, EditorSnapshot } from "./Command";
import type { KeySignature } from "../model";

export class ChangeKeySig implements Command {
  description = "Change key signature";

  constructor(private keySignature: KeySignature) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    if (!measure) return state;

    measure.keySignature = { ...this.keySignature };

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
