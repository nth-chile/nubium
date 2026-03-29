import type { Command, EditorSnapshot } from "./Command";
import type { DynamicLevel } from "../model/annotations";
import type { NoteEventId } from "../model/ids";

export class SetDynamic implements Command {
  description = "Set dynamic";

  constructor(
    private level: DynamicLevel | null,
    private noteEventId: NoteEventId,
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    if (!measure) return state;

    // Remove existing dynamic on this event
    measure.annotations = measure.annotations.filter(
      (a) => !(a.kind === "dynamic" && a.noteEventId === this.noteEventId),
    );

    if (this.level) {
      measure.annotations.push({
        kind: "dynamic",
        level: this.level,
        noteEventId: this.noteEventId,
      });
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
