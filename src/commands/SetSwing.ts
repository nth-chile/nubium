import type { Command, EditorSnapshot } from "./Command";
import type { SwingSettings, TempoMark } from "../model/annotations";

export class SetSwing implements Command {
  description = "Set swing";

  constructor(private swing: SwingSettings | undefined) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const { measureIndex } = state.inputState.cursor;

    // Find or create a tempo mark on the current measure (first part)
    const m = score.parts[0]?.measures[measureIndex];
    if (!m) return state;

    const tempoIdx = m.annotations.findIndex((a) => a.kind === "tempo-mark");
    if (tempoIdx >= 0) {
      // Update existing tempo mark
      const tempo = m.annotations[tempoIdx] as TempoMark;
      if (this.swing) {
        tempo.swing = this.swing;
      } else {
        delete tempo.swing;
      }
    } else {
      // No tempo mark here — create one with the score's global tempo
      const newTempo: TempoMark = {
        kind: "tempo-mark",
        bpm: score.tempo,
        beatUnit: "quarter",
        swing: this.swing,
      };
      m.annotations.push(newTempo);
    }

    return { score, inputState: state.inputState };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
