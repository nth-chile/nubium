import type { Command, EditorSnapshot } from "./Command";
import type { NoteEventId } from "../model/ids";

export class SetHairpin implements Command {
  description = "Set hairpin";

  constructor(
    private type: "crescendo" | "diminuendo" | null,
    private startEventId: NoteEventId,
    private endEventId: NoteEventId,
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    if (!measure) return state;

    // Remove existing hairpin with same start
    measure.annotations = measure.annotations.filter(
      (a) => !(a.kind === "hairpin" && a.startEventId === this.startEventId),
    );

    if (this.type) {
      measure.annotations.push({
        kind: "hairpin",
        type: this.type,
        startEventId: this.startEventId,
        endEventId: this.endEventId,
      });
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
