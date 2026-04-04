import type { Duration, Accidental, PitchClass, Octave } from "../model";
import { getSettings } from "../settings";

export interface CursorPosition {
  partIndex: number;
  measureIndex: number;
  voiceIndex: number; // index into measure.voices flat array
  eventIndex: number;
  staveIndex: number; // 0 = primary staff, 1 = bass staff for grand staff instruments
}

export interface InputState {
  duration: Duration;
  accidental: Accidental;
  voice: number;
  cursor: CursorPosition;
  octave: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  stepEntry: boolean;
  insertMode: boolean;
  graceNoteMode: boolean;
  textInputMode: "chord" | "lyric" | null;
  textInputBuffer: string;
  textInputInitialValue: string;
  lyricVerse: number;
  pitchBeforeDuration: boolean;
  pendingPitch: { pitchClass: PitchClass; octave: Octave; accidental: Accidental } | null;
}

export function defaultInputState(): InputState {
  return {
    duration: { type: "quarter", dots: 0 },
    accidental: "natural",
    voice: 0,
    cursor: {
      partIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      eventIndex: 0,
      staveIndex: 0,
    },
    octave: 4,
    stepEntry: false,
    insertMode: false,
    graceNoteMode: false,
    textInputMode: null,
    textInputBuffer: "",
    textInputInitialValue: "",
    lyricVerse: 1,
    pitchBeforeDuration: getSettings().pitchBeforeDuration,
    pendingPitch: null,
  };
}
