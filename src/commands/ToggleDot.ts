import type { Command, EditorSnapshot } from "./Command";
import { durationToTicks, ticksToDurations } from "../model/duration";
import { newId, type NoteEventId } from "../model/ids";

export class ToggleDot implements Command {
  description = "Toggle dot";
  private previousSnapshot: EditorSnapshot | null = null;

  execute(state: EditorSnapshot): EditorSnapshot {
    this.previousSnapshot = { score: structuredClone(state.score), inputState: structuredClone(state.inputState) };

    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event) return state;

    const oldTicks = durationToTicks(event.duration, event.tuplet);
    const newDots = ((event.duration.dots + 1) % 4) as 0 | 1 | 2 | 3;
    event.duration = { ...event.duration, dots: newDots };
    const newTicks = durationToTicks(event.duration, event.tuplet);

    if (newTicks < oldTicks) {
      const fillerRests = ticksToDurations(oldTicks - newTicks).map((d) => ({
        kind: "rest" as const,
        id: newId<NoteEventId>("evt"),
        duration: d,
      }));
      voice.events.splice(eventIndex + 1, 0, ...fillerRests);
    } else if (newTicks > oldTicks) {
      const needed = newTicks - oldTicks;
      let consumed = 0;
      let removeCount = 0;
      for (let i = eventIndex + 1; i < voice.events.length && consumed < needed; i++) {
        if (voice.events[i].kind !== "rest") break;
        consumed += durationToTicks(voice.events[i].duration, voice.events[i].tuplet);
        removeCount++;
      }
      if (consumed >= needed) {
        voice.events.splice(eventIndex + 1, removeCount);
        if (consumed > needed) {
          const excessRests = ticksToDurations(consumed - needed).map((d) => ({
            kind: "rest" as const,
            id: newId<NoteEventId>("evt"),
            duration: d,
          }));
          voice.events.splice(eventIndex + 1, 0, ...excessRests);
        }
      }
    }

    return { score, inputState: input };
  }

  undo(_state: EditorSnapshot): EditorSnapshot {
    if (!this.previousSnapshot) return _state;
    return this.previousSnapshot;
  }
}
