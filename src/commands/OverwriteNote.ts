import type { Command, EditorSnapshot } from "./Command";
import type { PitchClass, Octave, Accidental, Duration } from "../model";
import { newId, type NoteEventId } from "../model/ids";

/**
 * Overwrites the event at cursor with a new note (step entry mode).
 * If cursor is past the end, inserts instead.
 */
export class OverwriteNote implements Command {
  description = "Overwrite note (step entry)";

  constructor(
    private pitchClass: PitchClass,
    private octave: Octave,
    private accidental: Accidental,
    private duration: Duration,
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    const voice = measure?.voices[voiceIndex];
    if (!voice || !measure) return state;

    const newEvent = {
      kind: "note" as const,
      id: newId<NoteEventId>("evt"),
      duration: this.duration,
      head: {
        pitch: {
          pitchClass: this.pitchClass,
          accidental: this.accidental,
          octave: this.octave,
        },
      },
    };

    if (eventIndex < voice.events.length) {
      // Overwrite existing event
      voice.events[eventIndex] = newEvent;
    } else {
      // Past the end — insert
      voice.events.push(newEvent);
    }

    input.cursor.eventIndex = eventIndex + 1;
    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
