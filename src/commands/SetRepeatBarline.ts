import type { Command, EditorSnapshot } from "./Command";
import type { BarlineType } from "../model/time";

export class SetRepeatBarline implements Command {
  description = "Set repeat barline";

  constructor(private barlineType: BarlineType) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Apply barline change across all parts at this measure index
    for (const part of score.parts) {
      const measure = part.measures[measureIndex];
      if (!measure) continue;
      // Toggle: if already set to the target type, revert to "single"
      measure.barlineEnd =
        measure.barlineEnd === this.barlineType ? "single" : this.barlineType;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
