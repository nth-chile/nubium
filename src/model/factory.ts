import type { Score, Part, Measure, Voice } from "./score";
import type { Note, Chord, Rest, Slash, GraceNote, NoteHead } from "./note";
import type { Pitch, PitchClass, Accidental, Octave } from "./pitch";
import type { Duration, DurationType } from "./duration";
import type { Clef, TimeSignature, KeySignature } from "./time";
import type { Annotation } from "./annotations";
import {
  newId,
  type ScoreId,
  type PartId,
  type MeasureId,
  type VoiceId,
  type NoteEventId,
} from "./ids";

export function pitch(
  pitchClass: PitchClass,
  octave: Octave,
  accidental: Accidental = "natural"
): Pitch {
  return { pitchClass, accidental, octave };
}

export function dur(type: DurationType, dots: 0 | 1 | 2 | 3 = 0): Duration {
  return { type, dots };
}

export function note(
  pitchClass: PitchClass,
  octave: Octave,
  duration: Duration,
  accidental: Accidental = "natural"
): Note {
  return {
    kind: "note",
    id: newId<NoteEventId>("evt"),
    duration,
    head: { pitch: pitch(pitchClass, octave, accidental) },
  };
}

export function chord(heads: NoteHead[], duration: Duration): Chord {
  return {
    kind: "chord",
    id: newId<NoteEventId>("evt"),
    duration,
    heads,
  };
}

export function rest(duration: Duration): Rest {
  return {
    kind: "rest",
    id: newId<NoteEventId>("evt"),
    duration,
  };
}

export function graceNote(
  pitchClass: PitchClass,
  octave: Octave,
  accidental: Accidental = "natural",
  slash = true,
): GraceNote {
  return {
    kind: "grace",
    id: newId<NoteEventId>("evt"),
    duration: { type: "eighth", dots: 0 },
    head: { pitch: pitch(pitchClass, octave, accidental) },
    slash,
  };
}

export function slash(duration: Duration): Slash {
  return {
    kind: "slash",
    id: newId<NoteEventId>("evt"),
    duration,
  };
}

export function noteHead(
  pitchClass: PitchClass,
  octave: Octave,
  accidental: Accidental = "natural",
  tied = false
): NoteHead {
  return { pitch: pitch(pitchClass, octave, accidental), tied: tied || undefined };
}

export function voice(events: import("./note").NoteEvent[]): Voice {
  return { id: newId<VoiceId>("vce"), events };
}

export function measure(
  voices: Voice[],
  options: {
    clef?: Clef;
    timeSignature?: TimeSignature;
    keySignature?: KeySignature;
    annotations?: Annotation[];
  } = {}
): Measure {
  return {
    id: newId<MeasureId>("msr"),
    clef: options.clef ?? { type: "treble" },
    timeSignature: options.timeSignature ?? { numerator: 4, denominator: 4 },
    keySignature: options.keySignature ?? { fifths: 0 },
    barlineEnd: "single",
    annotations: options.annotations ?? [],
    voices,
  };
}

export function part(
  name: string,
  abbreviation: string,
  measures: Measure[],
  instrumentId = ""
): Part {
  return {
    id: newId<PartId>("prt"),
    name,
    abbreviation,
    instrumentId,
    muted: false,
    solo: false,
    measures,
  };
}

export function score(title: string, composer: string, parts: Part[], tempo = 120): Score {
  return {
    id: newId<ScoreId>("scr"),
    title,
    composer,
    formatVersion: 1,
    tempo,
    parts,
  };
}

export function emptyScore(): Score {
  const emptyMeasures: Measure[] = [];
  for (let i = 0; i < 4; i++) {
    emptyMeasures.push(measure([voice([])]));
  }
  return score("", "", [part("Part 1", "P1", emptyMeasures)]);
}
