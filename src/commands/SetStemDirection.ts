import type { Command, EditorSnapshot } from "./Command";

export type StemDirectionValue = "up" | "down" | null;

export class SetStemDirection implements Command {
  description = "Set stem direction";

  constructor(private direction: StemDirectionValue) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event || event.kind === "rest" || event.kind === "slash" || event.kind === "grace") return state;

    if (this.direction === null) {
      delete (event as { stemDirection?: string }).stemDirection;
    } else {
      event.stemDirection = this.direction;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
