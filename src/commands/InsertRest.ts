import type { Command, EditorSnapshot } from "./Command";
import type { Duration } from "../model";
import { newId, type NoteEventId } from "../model/ids";
import { durationToTicks, measureCapacity, voiceTicksUsed } from "../model/duration";

export class InsertRest implements Command {
  description = "Insert rest";

  constructor(private duration: Duration) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    const voice = measure?.voices[voiceIndex];
    if (!voice || !measure) return state;

    // Check measure capacity
    const cap = measureCapacity(
      measure.timeSignature.numerator,
      measure.timeSignature.denominator
    );
    const currentTicks = voiceTicksUsed(voice.events);
    const newTicks = durationToTicks(this.duration);

    if (currentTicks + newTicks > cap) {
      // Auto-advance to next measure
      const part = score.parts[partIndex];
      if (part && measureIndex < part.measures.length - 1) {
        input.cursor.measureIndex = measureIndex + 1;
        input.cursor.eventIndex = 0;

        // Ensure target voice exists in next measure
        const nextMeasure = part.measures[input.cursor.measureIndex];
        while (nextMeasure.voices.length <= voiceIndex) {
          nextMeasure.voices.push({
            id: newId<import("../model/ids").VoiceId>("vce"),
            events: [],
          });
        }

        const nextVoice = nextMeasure.voices[voiceIndex];
        const nextCap = measureCapacity(
          nextMeasure.timeSignature.numerator,
          nextMeasure.timeSignature.denominator
        );
        const nextTicks = voiceTicksUsed(nextVoice.events);
        if (nextTicks + newTicks > nextCap) {
          return { score, inputState: input };
        }

        nextVoice.events.splice(0, 0, {
          kind: "rest",
          id: newId<NoteEventId>("evt"),
          duration: this.duration,
        });
        input.cursor.eventIndex = 1;
        return { score, inputState: input };
      }
      return { score, inputState: input };
    }

    voice.events.splice(eventIndex, 0, {
      kind: "rest",
      id: newId<NoteEventId>("evt"),
      duration: this.duration,
    });

    input.cursor.eventIndex = eventIndex + 1;
    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
