import type { Command, EditorSnapshot } from "./Command";

export class DeleteNote implements Command {
  description = "Delete note";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    // Delete the event at cursor, or the one before if at append position
    const deleteIndex = eventIndex < voice.events.length
      ? eventIndex
      : voice.events.length - 1;

    if (deleteIndex < 0) return state;

    voice.events.splice(deleteIndex, 1);
    input.cursor.eventIndex = Math.min(deleteIndex, voice.events.length);
    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
