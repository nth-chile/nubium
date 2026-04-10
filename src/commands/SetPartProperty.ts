import type { Command, EditorSnapshot } from "./Command";
import type { Tuning } from "../model/guitar";

export type PartPropertyUpdate =
  | { field: "name"; value: string }
  | { field: "abbreviation"; value: string }
  | { field: "capo"; value: number }
  | { field: "tuning"; value: Tuning | undefined }
  | { field: "muted"; value: boolean }
  | { field: "solo"; value: boolean };

export class SetPartProperty implements Command {
  description = "Set part property";

  constructor(
    private partIndex: number,
    private update: PartPropertyUpdate,
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);

    const part = score.parts[this.partIndex];
    if (!part) return state;

    switch (this.update.field) {
      case "name":
        part.name = this.update.value;
        break;
      case "abbreviation":
        part.abbreviation = this.update.value;
        break;
      case "capo":
        part.capo = this.update.value > 0 ? this.update.value : undefined;
        break;
      case "tuning":
        part.tuning = this.update.value;
        break;
      case "muted":
        part.muted = this.update.value;
        break;
      case "solo":
        part.solo = this.update.value;
        break;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
