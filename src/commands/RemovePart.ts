import type { Command, EditorSnapshot } from "./Command";

// Score-level annotations that should transfer when a part is deleted
const SCORE_LEVEL_ANNOTATION_KINDS = new Set(["rehearsal-mark", "tempo-mark", "chord-symbol"]);

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

    // Transfer score-level data to the next available part
    const targetPartIndex = this.partIndex === 0 ? 1 : 0;
    const targetPart = score.parts[targetPartIndex];
    if (targetPart) {
      for (let mi = 0; mi < removedPart.measures.length && mi < targetPart.measures.length; mi++) {
        const src = removedPart.measures[mi];
        const dst = targetPart.measures[mi];

        // Transfer score-level annotations
        for (const ann of src.annotations) {
          if (!SCORE_LEVEL_ANNOTATION_KINDS.has(ann.kind)) continue;
          const isDup = dst.annotations.some(a => a.kind === ann.kind &&
            ("text" in a && "text" in ann ? (a as any).text === (ann as any).text : true));
          if (!isDup) dst.annotations.push(ann);
        }

        // Transfer navigation marks (volta, coda, segno, D.S., D.C., Fine)
        if (src.navigation && !dst.navigation) {
          dst.navigation = { ...src.navigation };
        } else if (src.navigation && dst.navigation) {
          if (src.navigation.volta && !dst.navigation.volta) dst.navigation.volta = src.navigation.volta;
          if (src.navigation.coda && !dst.navigation.coda) dst.navigation.coda = true;
          if (src.navigation.segno && !dst.navigation.segno) dst.navigation.segno = true;
          if (src.navigation.toCoda && !dst.navigation.toCoda) dst.navigation.toCoda = true;
          if (src.navigation.fine && !dst.navigation.fine) dst.navigation.fine = true;
          if (src.navigation.dsText && !dst.navigation.dsText) dst.navigation.dsText = src.navigation.dsText;
          if (src.navigation.dcText && !dst.navigation.dcText) dst.navigation.dcText = src.navigation.dcText;
        }

        // Transfer barline type (prefer non-single)
        if (src.barlineEnd !== "single" && dst.barlineEnd === "single") {
          dst.barlineEnd = src.barlineEnd;
        }

        // If target measure is empty but gets chord symbols, copy voice events
        // so VexFlow can position chords on notes
        const dstEmpty = !dst.voices.some(v => v && v.events.length > 0);
        const hasChords = dst.annotations.some(a => a.kind === "chord-symbol");
        if (dstEmpty && hasChords && src.voices.some(v => v && v.events.length > 0)) {
          dst.voices = structuredClone(src.voices);
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
