import type { Command, EditorSnapshot } from "./Command";

export class SetLyric implements Command {
  description = "Set lyric";

  constructor(
    private text: string,
    private syllableType: "begin" | "middle" | "end" | "single" = "single",
    private verseNumber: number = 1
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const measure = score.parts[partIndex]?.measures[measureIndex];
    const voice = measure?.voices[voiceIndex];
    if (!measure || !voice) return state;

    const event = voice.events[eventIndex];
    if (!event) return state;

    const noteEventId = event.id;

    // Remove existing lyric for this note event and verse
    measure.annotations = measure.annotations.filter(
      (a) =>
        !(
          a.kind === "lyric" &&
          a.noteEventId === noteEventId &&
          a.verseNumber === this.verseNumber
        )
    );

    if (this.text.trim()) {
      measure.annotations.push({
        kind: "lyric",
        text: this.text.trim(),
        noteEventId,
        syllableType: this.syllableType,
        verseNumber: this.verseNumber,
      });
    }

    // Advance cursor to next event
    if (eventIndex < voice.events.length - 1) {
      input.cursor.eventIndex = eventIndex + 1;
    } else {
      // Advance to next measure
      const part = score.parts[partIndex];
      if (part && measureIndex < part.measures.length - 1) {
        input.cursor.measureIndex = measureIndex + 1;
        input.cursor.eventIndex = 0;
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
