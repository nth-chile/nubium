import type { NoteEvent } from "./note";
import type { Clef, TimeSignature, KeySignature, BarlineType } from "./time";
import type { ScoreId, PartId, MeasureId, VoiceId } from "./ids";
import type { Annotation } from "./annotations";
import type { Stylesheet } from "./stylesheet";
import type { NavigationMarks } from "./navigation";
import type { Tuning } from "./guitar";

export interface Score {
  id: ScoreId;
  title: string;
  composer: string;
  formatVersion: number;
  tempo: number;
  parts: Part[];
  stylesheet?: Partial<Stylesheet>;
}

export interface Part {
  id: PartId;
  name: string;
  abbreviation: string;
  instrumentId: string;
  muted: boolean;
  solo: boolean;
  measures: Measure[];
  tuning?: Tuning;
  capo?: number;
}

/** Layout/section break attached to the *end* of a measure — the break happens
 *  before the next measure. Values are mutually exclusive except "section"
 *  which implies a system break and also resets measure numbering / shows
 *  courtesies. */
export type MeasureBreak = "system" | "page" | "section";

export interface Measure {
  id: MeasureId;
  clef: Clef;
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  barlineEnd: BarlineType;
  /** Number of times the repeat section (ending at this barline) should play,
   *  including the first pass. Only applies when barlineEnd is "repeat-end" or
   *  "repeat-both". Omitted or 2 means one repeat (standard behavior). */
  repeatTimes?: number;
  navigation?: NavigationMarks;
  annotations: Annotation[];
  voices: Voice[];
  isPickup?: boolean;
  /** Break forced at the end of this measure (before the next one). */
  break?: MeasureBreak;
}

export interface Voice {
  id: VoiceId;
  events: NoteEvent[];
  staff?: number; // 0 (default) for primary staff, 1 for bass staff on grand staff instruments
}
