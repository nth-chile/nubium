import type { Command, EditorSnapshot } from "./Command";
import type { NoteEventId } from "../model";
import { durationToTicks } from "../model/duration";

export class SetChordSymbol implements Command {
  description = "Set chord symbol";

  constructor(
    private text: string,
    private beatOffset: number,
    private noteEventId: NoteEventId
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Apply chord symbol to ALL parts at this measure (score-level annotation)
    for (const part of score.parts) {
      const measure = part.measures[measureIndex];
      if (!measure) continue;

      // Remove existing chord at this beat offset
      measure.annotations = measure.annotations.filter(
        (a) => !(a.kind === "chord-symbol" && a.beatOffset === this.beatOffset)
      );

      if (this.text.trim()) {
        // Find the note at this beat offset in this part's voice
        let noteId = this.noteEventId;
        const voice = measure.voices[0];
        if (voice) {
          let offset = 0;
          for (const evt of voice.events) {
            if (evt.kind === "grace") continue;
            if (offset === this.beatOffset) {
              noteId = evt.id;
              break;
            }
            offset += durationToTicks(evt.duration, evt.tuplet);
          }
        }

        measure.annotations.push({
          kind: "chord-symbol",
          text: this.text.trim(),
          beatOffset: this.beatOffset,
          noteEventId: noteId,
        });
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
