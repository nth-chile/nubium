import type { Duration, Accidental } from "../model";

export interface CursorPosition {
  partIndex: number;
  measureIndex: number;
  voiceIndex: number;
  eventIndex: number;
}

export interface InputState {
  duration: Duration;
  accidental: Accidental;
  voice: number;
  cursor: CursorPosition;
  octave: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  stepEntry: boolean;
  textInputMode: "chord" | "lyric" | null;
  textInputBuffer: string;
  textInputInitialValue: string;
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
    },
    octave: 4,
    stepEntry: false,
    textInputMode: null,
    textInputBuffer: "",
    textInputInitialValue: "",
  };
}
