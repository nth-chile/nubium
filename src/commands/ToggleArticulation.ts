import type { Command, EditorSnapshot } from "./Command";
import type { Articulation, ArticulationKind, NoteEvent } from "../model/note";
import { pitchToTab, STANDARD_TUNING } from "../model/guitar";

// Mutually exclusive groups — adding one removes others in the same group
const EXCLUSION_GROUPS: string[][] = [
  ["bend", "pre-bend", "bend-release"],
  ["slide-in-below", "slide-in-above"],
  ["slide-out-below", "slide-out-above", "slide-up", "slide-down"],
  ["down-bow", "up-bow"],
  ["down-stroke", "up-stroke", "fingerpick-p", "fingerpick-i", "fingerpick-m", "fingerpick-a"],
  ["hammer-on", "pull-off"],
  ["staccato", "staccatissimo"],
  ["accent", "marcato"],
  ["harmonic", "palm-mute", "tapping"],
];

// Dead note is incompatible with all of these, but they don't exclude each other
const DEAD_NOTE_INCOMPATIBLE = new Set([
  "bend", "pre-bend", "bend-release", "harmonic",
  "slide-up", "slide-down", "slide-in-below", "slide-in-above",
  "slide-out-below", "slide-out-above", "hammer-on", "pull-off",
  "trill", "vibrato", "let-ring",
]);

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
    // Dead note: one-directional — adding dead-note removes these, and adding these removes dead-note
    if (this.kind === "dead-note") {
      for (const k of DEAD_NOTE_INCOMPATIBLE) excluded.add(k);
    } else if (DEAD_NOTE_INCOMPATIBLE.has(this.kind)) {
      excluded.add("dead-note");
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

    // Cross-note slide conflicts:
    // Adding slide-up/down on this note → remove slide-in-* from next note
    // Adding slide-up/down on this note → remove slide-out-* from previous note
    // Adding slide-in-* on this note → remove slide-up/down from previous note
    // Adding slide-out-* on this note → remove slide-up/down from next note
    const SLIDE_CONNECTIONS = new Set(["slide-up", "slide-down"]);
    const SLIDE_INS = new Set(["slide-in-below", "slide-in-above"]);
    const SLIDE_OUTS = new Set(["slide-out-below", "slide-out-above"]);
    const isAdding = !has; // we're adding, not removing

    if (isAdding) {
      const prevEvent = eventIndex > 0 ? voice.events[eventIndex - 1] : undefined;
      const nextEvent = eventIndex < voice.events.length - 1 ? voice.events[eventIndex + 1] : undefined;

      const stripArts = (ev: NoteEvent | undefined, kinds: Set<string>) => {
        if (!ev || !("articulations" in ev) || !ev.articulations) return;
        ev.articulations = ev.articulations.filter((a) => !kinds.has(a.kind));
        if (ev.articulations.length === 0) ev.articulations = undefined;
      };

      if (SLIDE_CONNECTIONS.has(this.kind)) {
        stripArts(nextEvent, SLIDE_INS);
        stripArts(prevEvent, SLIDE_OUTS);
      }
      if (SLIDE_INS.has(this.kind)) {
        stripArts(prevEvent, SLIDE_CONNECTIONS);
      }
      // Hammer-on/pull-off: block if next note is on a different string
      if ((this.kind === "hammer-on" || this.kind === "pull-off") && nextEvent) {
        const tuning = score.parts[partIndex]?.tuning ?? STANDARD_TUNING;
        const getStr = (ev: NoteEvent) => {
          if (ev.kind === "note") return ev.tabInfo?.string ?? ev.head.tabInfo?.string ?? pitchToTab(ev.head.pitch, tuning).string;
          if (ev.kind === "chord") return ev.tabInfo?.string ?? ev.heads[0]?.tabInfo?.string ?? pitchToTab(ev.heads[0].pitch, tuning).string;
          return undefined;
        };
        const curString = getStr(event);
        const nextString = getStr(nextEvent);
        if (curString != null && nextString != null && curString !== nextString) {
          event.articulations = arts.length > 0 ? [...arts] : undefined;
          return { score, inputState: input };
        }
      }
    }

    return { score, inputState: input };
  }

  undo(state: EditorSnapshot): EditorSnapshot {
    return state;
  }
}
