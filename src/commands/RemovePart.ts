import type { Command, EditorSnapshot } from "./Command";

// Annotations that apply to the whole score, not just one part
const GLOBAL_ANNOTATION_KINDS = new Set(["rehearsal-mark", "tempo-mark"]);

export class RemovePart implements Command {
  description = "Remove part";

  constructor(private partIndex: number) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);

    // Can't remove the last part
    if (score.parts.length <= 1) return { score, inputState: input };

    // Validate index
    if (this.partIndex < 0 || this.partIndex >= score.parts.length) {
      return { score, inputState: input };
    }

    const removedPart = score.parts[this.partIndex];

    // Transfer global annotations to the next available part
    const targetPartIndex = this.partIndex === 0 ? 1 : 0;
    const targetPart = score.parts[targetPartIndex];
    if (targetPart) {
      for (let mi = 0; mi < removedPart.measures.length && mi < targetPart.measures.length; mi++) {
        const removedMeasure = removedPart.measures[mi];
        const targetMeasure = targetPart.measures[mi];
        for (const ann of removedMeasure.annotations) {
          if (GLOBAL_ANNOTATION_KINDS.has(ann.kind)) {
            // Only transfer if the target doesn't already have this type at this position
            const alreadyHas = targetMeasure.annotations.some(
              (a) => a.kind === ann.kind && ("beat" in a && "beat" in ann ? a.beat === ann.beat : true)
            );
            if (!alreadyHas) {
              targetMeasure.annotations.push(ann);
            }
          }
        }
      }
    }

    score.parts.splice(this.partIndex, 1);

    // Adjust cursor if it was on or beyond the removed part
    if (input.cursor.partIndex >= score.parts.length) {
      input.cursor.partIndex = score.parts.length - 1;
      input.cursor.eventIndex = 0;
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
