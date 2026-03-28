export type PitchClass = "C" | "D" | "E" | "F" | "G" | "A" | "B";

export type Accidental =
  | "double-flat"
  | "flat"
  | "natural"
  | "sharp"
  | "double-sharp";

export type Octave = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Pitch {
  pitchClass: PitchClass;
  accidental: Accidental;
  octave: Octave;
}

const SEMITONES: Record<PitchClass, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACC_MOD: Record<Accidental, number> = {
  "double-flat": -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  "double-sharp": 2,
};

export function pitchToMidi(p: Pitch): number {
  return 12 * (p.octave + 1) + SEMITONES[p.pitchClass] + ACC_MOD[p.accidental];
}

export function midiToPitch(midi: number): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  const NATURAL_MAP: [PitchClass, number][] = [
    ["C", 0],
    ["D", 2],
    ["E", 4],
    ["F", 5],
    ["G", 7],
    ["A", 9],
    ["B", 11],
  ];
  for (const [pc, s] of NATURAL_MAP) {
    if (s === semitone) {
      return { pitchClass: pc, accidental: "natural", octave: octave as Octave };
    }
  }
  // Default to sharp for black keys
  // Map each black key semitone to its sharp spelling
  const BLACK_KEY_MAP: Record<number, [PitchClass, Accidental]> = {
    1: ["C", "sharp"],   // C#
    3: ["D", "sharp"],   // D#
    6: ["F", "sharp"],   // F#
    8: ["G", "sharp"],   // G#
    10: ["A", "sharp"],  // A#
  };
  const entry = BLACK_KEY_MAP[semitone];
  if (entry) {
    return { pitchClass: entry[0], accidental: entry[1], octave: octave as Octave };
  }
  // Fallback (should not reach here)
  return { pitchClass: "C", accidental: "natural", octave: octave as Octave };
}

const PITCH_ORDER: PitchClass[] = ["C", "D", "E", "F", "G", "A", "B"];

export function stepUp(p: Pitch): Pitch {
  const idx = PITCH_ORDER.indexOf(p.pitchClass);
  if (idx === 6) {
    return {
      pitchClass: "C",
      accidental: "natural",
      octave: Math.min(9, p.octave + 1) as Octave,
    };
  }
  return {
    pitchClass: PITCH_ORDER[idx + 1],
    accidental: "natural",
    octave: p.octave,
  };
}

export function stepDown(p: Pitch): Pitch {
  const idx = PITCH_ORDER.indexOf(p.pitchClass);
  if (idx === 0) {
    return {
      pitchClass: "B",
      accidental: "natural",
      octave: Math.max(0, p.octave - 1) as Octave,
    };
  }
  return {
    pitchClass: PITCH_ORDER[idx - 1],
    accidental: "natural",
    octave: p.octave,
  };
}
