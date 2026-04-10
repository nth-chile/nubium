import type { Command, EditorSnapshot } from "./Command";
import type { KeySignature } from "../model";
import { keyAccidental } from "../model/pitch";
import type { NoteEvent } from "../model/note";

/** Update a note event's accidentals from old key sig to new key sig. */
function adjustEventAccidentals(event: NoteEvent, oldFifths: number, newFifths: number): NoteEvent {
  if (event.kind === "note" || event.kind === "grace") {
    const pc = event.head.pitch.pitchClass;
    const oldDefault = keyAccidental(pc, oldFifths);
    const newDefault = keyAccidental(pc, newFifths);
    // Only adjust if the note matched the old key default (wasn't explicitly altered)
    if (event.head.pitch.accidental === oldDefault && oldDefault !== newDefault) {
      return {
        ...event,
        head: { ...event.head, pitch: { ...event.head.pitch, accidental: newDefault } },
      };
    }
  } else if (event.kind === "chord") {
    const newHeads = event.heads.map((h) => {
      const pc = h.pitch.pitchClass;
      const oldDefault = keyAccidental(pc, oldFifths);
      const newDefault = keyAccidental(pc, newFifths);
      if (h.pitch.accidental === oldDefault && oldDefault !== newDefault) {
        return { ...h, pitch: { ...h.pitch, accidental: newDefault } };
      }
      return h;
    });
    return { ...event, heads: newHeads };
  }
  return event;
}

export class ChangeKeySig implements Command {
  description = "Change key signature";

  constructor(private keySignature: KeySignature) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    // Key signature changes apply to all parts from this measure forward
    // (until the next explicit key sig change)
    for (const part of score.parts) {
      const oldFifths = part.measures[measureIndex]?.keySignature?.fifths ?? 0;
      const newFifths = this.keySignature.fifths;
      for (let mi = measureIndex; mi < part.measures.length; mi++) {
        const m = part.measures[mi];
        if (!m) continue;
        // Stop propagating if we hit a measure that already has a different key sig
        // (i.e., a later key sig change) — but always set the target measure
        if (mi > measureIndex && m.keySignature.fifths !== oldFifths) break;

        // Adjust existing note accidentals to match the new key
        if (oldFifths !== newFifths) {
          for (const voice of m.voices) {
            voice.events = voice.events.map((evt) =>
              adjustEventAccidentals(evt, oldFifths, newFifths)
            );
          }
        }

        m.keySignature = { ...this.keySignature };
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
