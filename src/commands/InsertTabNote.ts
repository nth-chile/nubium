import type { Command, EditorSnapshot } from "./Command";
import type { Duration } from "../model";
import type { Tuning } from "../model/guitar";
import { STANDARD_TUNING } from "../model/guitar";
import { midiToPitch } from "../model/pitch";
import { newId, type NoteEventId } from "../model/ids";
import { durationToTicks, measureCapacity, voiceTicksUsed } from "../model/duration";
import { appendMeasureToAllParts } from "./measureUtils";

/**
 * Insert or overwrite a note from tab input (fret + string).
 * Converts fret/string/tuning to a pitch and stores explicit tabInfo.
 *
 * Mirrors InsertNote's auto-advance behavior: when appending past the end
 * of a full measure, advances the cursor to the next measure (appending a
 * new measure at end-of-score if needed).
 */
export class InsertTabNote implements Command {
  description = "Insert tab note";

  constructor(
    private fret: number,
    private string: number, // 1-6 (1 = high E)
    private duration: Duration,
    private tuning: Tuning = STANDARD_TUNING,
    private capo: number = 0,
  ) {}

  private buildEvent() {
    const stringIdx = this.tuning.strings.length - this.string;
    const openMidi = this.tuning.strings[stringIdx];
    if (openMidi === undefined) return null;
    const midi = openMidi + this.fret + this.capo;
    const pitch = midiToPitch(midi);
    return {
      kind: "note" as const,
      id: newId<NoteEventId>("evt"),
      duration: this.duration,
      head: {
        pitch,
        tabInfo: { string: this.string, fret: this.fret },
      },
      tabInfo: { string: this.string, fret: this.fret },
    };
  }

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    const voice = measure?.voices[voiceIndex];
    if (!voice || !measure) return state;

    const newEvent = this.buildEvent();
    if (!newEvent) return state;

    // Overwrite path: cursor is on an existing event — replace it.
    if (eventIndex < voice.events.length) {
      voice.events[eventIndex] = newEvent;
      input.cursor.eventIndex = eventIndex + 1;
      input.tabFretBuffer = "";
      return { score, inputState: input };
    }

    // Append path: check capacity and auto-advance if the measure is full.
    const cap = measureCapacity(measure.timeSignature.numerator, measure.timeSignature.denominator);
    const currentTicks = voiceTicksUsed(voice.events);
    const newTicks = durationToTicks(this.duration);

    if (currentTicks + newTicks > cap) {
      const part = score.parts[partIndex];
      if (!part) return { score, inputState: input };

      if (measureIndex >= part.measures.length - 1) {
        appendMeasureToAllParts(score);
      }

      input.cursor.measureIndex = measureIndex + 1;
      input.cursor.eventIndex = 0;

      const nextMeasure = part.measures[input.cursor.measureIndex];
      const nextVoice = nextMeasure.voices[voiceIndex] ?? nextMeasure.voices[0];
      if (!nextVoice) {
        input.tabFretBuffer = "";
        return { score, inputState: input };
      }
      const nextCap = measureCapacity(nextMeasure.timeSignature.numerator, nextMeasure.timeSignature.denominator);
      const nextTicks = voiceTicksUsed(nextVoice.events);

      if (nextTicks + newTicks > nextCap) {
        if (nextVoice.events.length > 0) {
          nextVoice.events[0] = newEvent;
          input.cursor.eventIndex = 1;
        }
        input.tabFretBuffer = "";
        return { score, inputState: input };
      }

      nextVoice.events.splice(0, 0, newEvent);
      input.cursor.eventIndex = 1;
      input.tabFretBuffer = "";
      return { score, inputState: input };
    }

    voice.events.push(newEvent);
    input.cursor.eventIndex = eventIndex + 1;
    input.tabFretBuffer = "";
    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
