import type { Command, EditorSnapshot } from "./Command";

export class ToggleTie implements Command {
  description = "Toggle tie";

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event || event.kind === "rest" || event.kind === "slash") return state;

    if (event.kind === "note" || event.kind === "grace") {
      event.head.tied = !event.head.tied || undefined;
    } else if (event.kind === "chord") {
      // Toggle all heads together
      const allTied = event.heads.every((h) => h.tied);
      for (const head of event.heads) {
        head.tied = allTied ? undefined : true;
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
