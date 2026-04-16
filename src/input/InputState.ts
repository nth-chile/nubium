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
  /** True when user explicitly chose an accidental (vs. key signature default). */
  accidentalExplicit: boolean;
  voice: number;
  cursor: CursorPosition;
  octave: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** Top-level mode: when true, letter keys insert notes and the caret is active.
   *  When false (normal mode), letter keys are command shortcuts and the caret
   *  is just a selection anchor. */
  noteEntry: boolean;
  /** Sub-mode of note entry: when true, new notes push subsequent events forward
   *  instead of overwriting. Only meaningful while noteEntry is true. */
  insertMode: boolean;
  graceNoteMode: boolean;
  textInputMode: "chord" | "lyric" | null;
  textInputBuffer: string;
  textInputInitialValue: string;
  lyricVerse: number;
  pitchBeforeDuration: boolean;
  pendingPitch: { pitchClass: PitchClass; octave: Octave; accidental: Accidental } | null;
  /** Current string for tab input mode (1 = high E, 6 = low E). */
  tabString: number;
  /** Buffer for multi-digit fret entry (e.g., "1" then "2" → fret 12). */
  tabFretBuffer: string;
  /** True when cursor is on a tab stave (enables tab input regardless of other staves). */
  tabInputActive: boolean;
  /** When set, pitch edits target this head of a chord instead of the whole event.
   *  Cleared on cursor movement, event insertion, or when the cursor leaves the chord. */
  selectedHeadIndex: number | null;
}

export function defaultInputState(): InputState {
  return {
    duration: { type: "quarter", dots: 0 },
    accidental: "natural",
    accidentalExplicit: false,
    voice: 0,
    cursor: {
      partIndex: 0,
      measureIndex: 0,
      voiceIndex: 0,
      eventIndex: 0,
      staveIndex: 0,
    },
    octave: 4,
    noteEntry: false,
    insertMode: getSettings().startInInsertMode,
    graceNoteMode: false,
    textInputMode: null,
    textInputBuffer: "",
    textInputInitialValue: "",
    lyricVerse: 1,
    pitchBeforeDuration: getSettings().pitchBeforeDuration,
    pendingPitch: null,
    tabString: 1,
    tabFretBuffer: "",
    tabInputActive: false,
    selectedHeadIndex: null,
  };
}
