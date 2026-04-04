import type { NoteEventId } from "./ids";
import type { DurationType } from "./duration";

export interface ChordSymbol {
  kind: "chord-symbol";
  text: string; // "Cmaj7", "Dm7b5/A"
  beatOffset: number; // ticks from measure start
  noteEventId: NoteEventId;
}

export interface Lyric {
  kind: "lyric";
  text: string;
  noteEventId: NoteEventId;
  syllableType: "begin" | "middle" | "end" | "single";
  verseNumber: number;
}

export interface RehearsalMark {
  kind: "rehearsal-mark";
  text: string; // "A", "B", "Intro", etc.
}

export type SwingStyle = "straight" | "swing" | "shuffle";

export interface SwingSettings {
  style: SwingStyle;
  /** Ratio of long:short for swing pairs. 2 = triplet swing (2:1), 3 = hard swing (3:1). Default 2. */
  ratio?: number;
  /** Which subdivision swings. "eighth" (default) or "sixteenth". */
  subdivision?: "eighth" | "sixteenth";
  /** Velocity boost for backbeats (beats 2 & 4). 0-40. Used by shuffle. */
  backbeatAccent?: number;
}

export interface TempoMark {
  kind: "tempo-mark";
  bpm: number;
  beatUnit: DurationType;
  text?: string; // "Allegro", etc.
  swing?: SwingSettings;
}

export type DynamicLevel = "pp" | "p" | "mp" | "mf" | "f" | "ff" | "sfz" | "fp";

export interface DynamicMark {
  kind: "dynamic";
  level: DynamicLevel;
  noteEventId: NoteEventId;
}

export interface Hairpin {
  kind: "hairpin";
  type: "crescendo" | "diminuendo";
  startEventId: NoteEventId;
  endEventId: NoteEventId;
}

export interface Slur {
  kind: "slur";
  startEventId: NoteEventId;
  endEventId: NoteEventId;
}

export type Annotation = ChordSymbol | Lyric | RehearsalMark | TempoMark | DynamicMark | Hairpin | Slur;
