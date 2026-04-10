import type { Command, EditorSnapshot } from "./Command";

export class TogglePickup implements Command {
  description = "Toggle pickup measure";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Toggle isPickup on all parts for this measure index
    for (const part of score.parts) {
      const measure = part.measures[measureIndex];
      if (measure) {
        measure.isPickup = !measure.isPickup || undefined;
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
