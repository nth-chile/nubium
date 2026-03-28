import type { ClefType } from "./time";

export interface InstrumentDef {
  id: string;
  name: string;
  abbreviation: string;
  clef: ClefType;
  midiProgram: number;
  transposition: number; // semitones (0 for concert pitch)
  staves: number; // 1 for most, 2 for piano
}

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: "piano",
    name: "Piano",
    abbreviation: "Pno.",
    clef: "treble",
    midiProgram: 0,
    transposition: 0,
    staves: 1,
  },
  {
    id: "guitar",
    name: "Guitar",
    abbreviation: "Gtr.",
    clef: "treble",
    midiProgram: 25,
    transposition: 0,
    staves: 1,
  },
  {
    id: "bass",
    name: "Bass",
    abbreviation: "Bass",
    clef: "bass",
    midiProgram: 33,
    transposition: 0,
    staves: 1,
  },
  {
    id: "violin",
    name: "Violin",
    abbreviation: "Vln.",
    clef: "treble",
    midiProgram: 40,
    transposition: 0,
    staves: 1,
  },
  {
    id: "viola",
    name: "Viola",
    abbreviation: "Vla.",
    clef: "alto",
    midiProgram: 41,
    transposition: 0,
    staves: 1,
  },
  {
    id: "cello",
    name: "Cello",
    abbreviation: "Vc.",
    clef: "bass",
    midiProgram: 42,
    transposition: 0,
    staves: 1,
  },
  {
    id: "flute",
    name: "Flute",
    abbreviation: "Fl.",
    clef: "treble",
    midiProgram: 73,
    transposition: 0,
    staves: 1,
  },
  {
    id: "clarinet",
    name: "Clarinet",
    abbreviation: "Cl.",
    clef: "treble",
    midiProgram: 71,
    transposition: -2, // Bb clarinet: sounds a whole step lower
    staves: 1,
  },
  {
    id: "trumpet",
    name: "Trumpet",
    abbreviation: "Tpt.",
    clef: "treble",
    midiProgram: 56,
    transposition: -2, // Bb trumpet
    staves: 1,
  },
  {
    id: "alto-sax",
    name: "Alto Sax",
    abbreviation: "A.Sx.",
    clef: "treble",
    midiProgram: 65,
    transposition: -9, // Eb alto sax
    staves: 1,
  },
  {
    id: "tenor-sax",
    name: "Tenor Sax",
    abbreviation: "T.Sx.",
    clef: "treble",
    midiProgram: 66,
    transposition: -14, // Bb tenor sax
    staves: 1,
  },
  {
    id: "drums",
    name: "Drums",
    abbreviation: "Dr.",
    clef: "treble", // percussion clef typically rendered as treble
    midiProgram: 0, // Channel 10 in GM
    transposition: 0,
    staves: 1,
  },
];

export function getInstrument(id: string): InstrumentDef | undefined {
  return INSTRUMENTS.find((i) => i.id === id);
}
