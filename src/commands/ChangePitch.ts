import type { Command, EditorSnapshot } from "./Command";
import type { PitchClass, Octave, Accidental } from "../model";

export class ChangePitch implements Command {
  description = "Change pitch";

  constructor(
    private pitchClass: PitchClass,
    private octave: Octave,
    private accidental: Accidental
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event) return state;

    if (event.kind === "note") {
      event.head.pitch = {
        pitchClass: this.pitchClass,
        accidental: this.accidental,
        octave: this.octave,
      };
    } else if (event.kind === "chord") {
      // Change the first head's pitch
      if (event.heads.length > 0) {
        event.heads[0].pitch = {
          pitchClass: this.pitchClass,
          accidental: this.accidental,
          octave: this.octave,
        };
      }
    }
    // rests: no pitch to change

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
