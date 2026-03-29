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
  | { kind: "slide-up" }
  | { kind: "slide-down" }
  | { kind: "hammer-on" }
  | { kind: "pull-off" }
  | { kind: "vibrato" }
  | { kind: "palm-mute" }
  | { kind: "harmonic" };

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

export interface GraceNote {
  kind: "grace";
  id: NoteEventId;
  duration: Duration;
  head: NoteHead;
  slash?: boolean; // acciaccatura (slashed) vs appoggiatura
  articulations?: Articulation[];
  tuplet?: TupletRatio;
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
