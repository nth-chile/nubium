import type { Command, EditorSnapshot } from "./Command";

export class SetScoreMeta implements Command {
  description = "Set score metadata";

  constructor(private field: "title" | "composer" | "tempo", private value: string | number) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);

    if (this.field === "title") {
      score.title = this.value as string;
    } else if (this.field === "composer") {
      score.composer = this.value as string;
    } else if (this.field === "tempo") {
      score.tempo = this.value as number;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
