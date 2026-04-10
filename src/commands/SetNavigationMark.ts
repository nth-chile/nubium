import type { Command, EditorSnapshot } from "./Command";

export type NavigationMarkType =
  | "coda"
  | "segno"
  | "toCoda"
  | "fine"
  | "ds"
  | "dc";

export class SetNavigationMark implements Command {
  description = "Set navigation mark";

  constructor(
    private markType: NavigationMarkType,
    private value?: string | boolean
  ) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { measureIndex } = input.cursor;

    for (const part of score.parts) {
      const measure = part.measures[measureIndex];
      if (!measure) continue;

      if (!measure.navigation) measure.navigation = {};
      const nav = measure.navigation;

      switch (this.markType) {
        case "coda":
          nav.coda = nav.coda ? undefined : true;
          break;
        case "segno":
          nav.segno = nav.segno ? undefined : true;
          break;
        case "toCoda":
          nav.toCoda = nav.toCoda ? undefined : true;
          break;
        case "fine":
          nav.fine = nav.fine ? undefined : true;
          break;
        case "ds":
          if (typeof this.value === "string") {
            nav.dsText = nav.dsText === this.value ? undefined : this.value;
          } else {
            nav.dsText = nav.dsText ? undefined : "D.S. al Coda";
          }
          break;
        case "dc":
          if (typeof this.value === "string") {
            nav.dcText = nav.dcText === this.value ? undefined : this.value;
          } else {
            nav.dcText = nav.dcText ? undefined : "D.C. al Fine";
          }
          break;
      }

      // Clean up empty navigation
      const hasAny = nav.volta || nav.coda || nav.segno || nav.toCoda || nav.fine || nav.dsText || nav.dcText;
      if (!hasAny) {
        delete measure.navigation;
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
