import type { Command, EditorSnapshot } from "./Command";

export class ToggleMute implements Command {
  description = "Toggle mute";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event || event.kind === "rest" || event.kind === "slash") return state;

    event.muted = !event.muted;
    if (!event.muted) delete event.muted;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
