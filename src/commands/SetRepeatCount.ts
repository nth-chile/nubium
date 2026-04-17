import type { Command, EditorSnapshot } from "./Command";

/**
 * Sets the number of times a repeated section should play (including the
 * first pass). Only meaningful on measures that end with a repeat barline.
 * Pass undefined (or 2) to clear the count back to the default one repeat.
 */
export class SetRepeatCount implements Command {
  description = "Set repeat count";

  constructor(private times: number | undefined) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    const clamped =
      this.times === undefined || this.times <= 2
        ? undefined
        : Math.min(Math.floor(this.times), 99);

    for (const part of score.parts) {
      const measure = part.measures[measureIndex];
      if (!measure) continue;
      if (clamped === undefined) delete measure.repeatTimes;
      else measure.repeatTimes = clamped;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
