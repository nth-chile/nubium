import type { Pitch } from "./pitch";
import type { Duration } from "./duration";
import type { NoteEventId } from "./ids";
import type { TabInfo } from "./guitar";

export type Articulation =
  | { kind: "staccato" }
  | { kind: "staccatissimo" }
  | { kind: "accent" }
  | { kind: "tenuto" }
  | { kind: "fermata" }
  | { kind: "marcato" }
  | { kind: "up-bow" }
  | { kind: "down-bow" }
  | { kind: "open-string" }
  | { kind: "stopped" }
  | { kind: "trill" }
  | { kind: "mordent" }
  | { kind: "turn" }
  | { kind: "bend"; semitones: number }
  | { kind: "pre-bend"; semitones: number }
  | { kind: "bend-release"; semitones: number }
  | { kind: "slide-up" }
  | { kind: "slide-down" }
  | { kind: "slide-in-below" }
  | { kind: "slide-in-above" }
  | { kind: "slide-out-below" }
  | { kind: "slide-out-above" }
  | { kind: "hammer-on" }
  | { kind: "pull-off" }
  | { kind: "vibrato" }
  | { kind: "palm-mute" }
  | { kind: "harmonic" }
  | { kind: "dead-note" }
  | { kind: "let-ring" }
  | { kind: "down-stroke" }
  | { kind: "up-stroke" }
  | { kind: "fingerpick-p" }
  | { kind: "fingerpick-i" }
  | { kind: "fingerpick-m" }
  | { kind: "fingerpick-a" }
  | { kind: "ghost-note" }
  | { kind: "tapping" }
  | { kind: "tremolo-picking" };

export type ArticulationKind = Articulation["kind"];

export interface NoteHead {
  pitch: Pitch;
  tied?: boolean;
  tabInfo?: TabInfo;
}

/** Tuplet ratio: `actual` notes in the space of `normal`. E.g. { actual: 3, normal: 2 } for triplets. */
export interface TupletRatio {
  actual: number;
  normal: number;
}

export type NoteEvent = Note | Chord | Rest | Slash | GraceNote;

/** Check if a note event renders on a different staff than expected (cross-staff notation). */
export function isCrossStaff(event: NoteEvent, currentStaff: number): boolean {
  return "renderStaff" in event && event.renderStaff != null && event.renderStaff !== currentStaff;
}

export interface GraceNote {
  kind: "grace";
  id: NoteEventId;
  duration: Duration;
  head: NoteHead;
  slash?: boolean; // acciaccatura (slashed) vs appoggiatura
  articulations?: Articulation[];
  tuplet?: TupletRatio;
  renderStaff?: number; // cross-staff: display on this staff index instead of voice's staff
  muted?: boolean; // when true, note renders normally but is skipped during playback
}

export interface Note {
  kind: "note";
  id: NoteEventId;
  duration: Duration;
  head: NoteHead;
  stemDirection?: "up" | "down" | null;
  tabInfo?: TabInfo;
  articulations?: Articulation[];
  tuplet?: TupletRatio;
  renderStaff?: number; // cross-staff: display on this staff index instead of voice's staff
  muted?: boolean; // when true, note renders normally but is skipped during playback
}

export interface Chord {
  kind: "chord";
  id: NoteEventId;
  duration: Duration;
  heads: NoteHead[];
  stemDirection?: "up" | "down" | null;
  tabInfo?: TabInfo;
  articulations?: Articulation[];
  tuplet?: TupletRatio;
  renderStaff?: number; // cross-staff: display on this staff index instead of voice's staff
  muted?: boolean; // when true, note renders normally but is skipped during playback
}

export interface Rest {
  kind: "rest";
  id: NoteEventId;
  duration: Duration;
  staffPosition?: number;
  tuplet?: TupletRatio;
}

export interface Slash {
  kind: "slash";
  id: NoteEventId;
  duration: Duration;
  tuplet?: TupletRatio;
}
