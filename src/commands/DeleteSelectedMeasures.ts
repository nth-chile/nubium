import type { Command, EditorSnapshot } from "./Command";
import type { Selection } from "../plugins/PluginAPI";
import { factory } from "../model";

export class DeleteSelectedMeasures implements Command {
  description = "Delete selected measures";

  constructor(private selection: Selection) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureStart, measureEnd } = this.selection;

    const part = score.parts[partIndex];
    if (!part) return state;

    const count = measureEnd - measureStart + 1;
    part.measures.splice(measureStart, count);

    if (part.measures.length === 0) {
      part.measures.push(factory.measure([factory.voice([])]));
    }

    input.cursor.measureIndex = Math.min(measureStart, part.measures.length - 1);
    input.cursor.eventIndex = 0;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
