import type { Command, EditorSnapshot } from "./Command";
import type { Articulation, ArticulationKind } from "../model/note";

// Mutually exclusive groups — adding one removes others in the same group
const EXCLUSION_GROUPS: string[][] = [
  ["bend", "pre-bend", "bend-release"],
  ["slide-in-below", "slide-in-above"],
  ["slide-out-below", "slide-out-above"],
  ["down-bow", "up-bow"],
  ["down-stroke", "up-stroke", "fingerpick-p", "fingerpick-i", "fingerpick-m", "fingerpick-a"],
  ["hammer-on", "pull-off"],
  ["staccato", "staccatissimo"],
  ["accent", "marcato"],
  ["dead-note", "bend", "pre-bend", "bend-release", "harmonic",
   "slide-up", "slide-down", "slide-in-below", "slide-in-above",
   "slide-out-below", "slide-out-above", "hammer-on", "pull-off",
   "trill", "vibrato", "let-ring"],
];

const SEMITONE_ARTS = new Set(["bend", "pre-bend", "bend-release"]);

export class ToggleArticulation implements Command {
  description = "Toggle articulation";

  constructor(private kind: ArticulationKind) {}

  execute(state: EditorSnapshot): EditorSnapshot {
    const score = structuredClone(state.score);
    const input = structuredClone(state.inputState);
    const { partIndex, measureIndex, voiceIndex, eventIndex } = input.cursor;

    const voice = score.parts[partIndex]?.measures[measureIndex]?.voices[voiceIndex];
    if (!voice) return state;

    const event = voice.events[eventIndex];
    if (!event || event.kind === "rest" || event.kind === "slash") return state;

    const arts: Articulation[] = event.articulations ?? [];
    const has = arts.findIndex((a) => a.kind === this.kind) >= 0;

    // Build set of kinds to exclude
    const excluded = new Set<string>();
    for (const group of EXCLUSION_GROUPS) {
      if (group.includes(this.kind)) {
        for (const k of group) if (k !== this.kind) excluded.add(k);
      }
    }

    // Remove conflicting articulations
    const filtered = arts.filter((a) => a.kind !== this.kind && !excluded.has(a.kind));

    if (SEMITONE_ARTS.has(this.kind)) {
      // Bend-type: cycle through 1 (half) → 2 (full) → 3 (1½) → remove
      const existing = arts.find((a) => a.kind === this.kind);
      const BEND_CYCLE = [1, 2, 3]; // half, full, 1½
      if (existing && "semitones" in existing) {
        const curIdx = BEND_CYCLE.indexOf(existing.semitones);
        const nextIdx = curIdx + 1;
        if (nextIdx < BEND_CYCLE.length) {
          // Cycle to next value
          filtered.push({ kind: this.kind, semitones: BEND_CYCLE[nextIdx] } as Articulation);
        }
        // else: past the end = remove (filtered already excludes it)
      } else {
        // First click: add as half bend
        filtered.push({ kind: this.kind, semitones: 1 } as Articulation);
      }
    } else if (!has) {
      filtered.push({ kind: this.kind } as Articulation);
    }

    event.articulations = filtered.length > 0 ? filtered : undefined;

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
