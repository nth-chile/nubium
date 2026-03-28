import { describe, it, expect } from "vitest";
import { transposeEvent, transposeScore } from "../builtins/Transpose";
import { retrogradeScore } from "../builtins/Retrograde";
import { changeDurationLevel, transformScore } from "../builtins/Augment";
import { identifyChord } from "../builtins/ChordAnalysis";
import { factory, pitchToMidi } from "../../model";
import type { Score } from "../../model";
import type { Note, Rest } from "../../model/note";
import { newId } from "../../model/ids";
import type { NoteEventId } from "../../model/ids";

function makeNote(pitchClass: "C" | "D" | "E" | "F" | "G" | "A" | "B", octave: number, durationType: string = "quarter"): Note {
  return {
    kind: "note",
    id: newId<NoteEventId>("evt"),
    duration: { type: durationType as any, dots: 0 },
    head: {
      pitch: {
        pitchClass,
        accidental: "natural",
        octave: octave as any,
      },
    },
  };
}

function makeRest(durationType: string = "quarter"): Rest {
  return {
    kind: "rest",
    id: newId<NoteEventId>("evt"),
    duration: { type: durationType as any, dots: 0 },
  };
}

function makeScoreWithNotes(notes: Note[]): Score {
  const score = factory.emptyScore();
  score.parts[0].measures[0].voices[0].events = notes;
  return score;
}

describe("Transpose Plugin", () => {
  it("transposes a note up by one semitone", () => {
    const note = makeNote("C", 4);
    const result = transposeEvent(note, 1);
    expect(result.kind).toBe("note");
    if (result.kind === "note") {
      // C4 (midi 60) + 1 = C#4 (midi 61)
      expect(result.head.pitch.pitchClass).toBe("C");
      expect(result.head.pitch.accidental).toBe("sharp");
      expect(result.head.pitch.octave).toBe(4);
    }
  });

  it("transposes a note down by one semitone", () => {
    const note = makeNote("C", 4);
    const result = transposeEvent(note, -1);
    expect(result.kind).toBe("note");
    if (result.kind === "note") {
      // C4 -> B3
      expect(result.head.pitch.pitchClass).toBe("B");
      expect(result.head.pitch.octave).toBe(3);
    }
  });

  it("transposes E up to F (no accidental)", () => {
    const note = makeNote("E", 4);
    const result = transposeEvent(note, 1);
    if (result.kind === "note") {
      expect(result.head.pitch.pitchClass).toBe("F");
      expect(result.head.pitch.accidental).toBe("natural");
    }
  });

  it("does not modify rests", () => {
    const rest = makeRest();
    const result = transposeEvent(rest, 1);
    expect(result.kind).toBe("rest");
  });

  it("transposes all notes in a score", () => {
    const notes = [makeNote("C", 4), makeNote("E", 4), makeNote("G", 4)];
    const score = makeScoreWithNotes(notes);
    const result = transposeScore(score, 2, null);
    const events = result.parts[0].measures[0].voices[0].events;

    // C4+2 = D4
    expect(events[0].kind).toBe("note");
    if (events[0].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("D");
    }
  });

  it("respects selection when transposing", () => {
    const score = factory.emptyScore();
    // Add a second measure
    score.parts[0].measures.push(structuredClone(score.parts[0].measures[0]));
    score.parts[0].measures[0].voices[0].events = [makeNote("C", 4)];
    score.parts[0].measures[1].voices[0].events = [makeNote("D", 4)];

    // Only transpose measure 0
    const result = transposeScore(score, 1, { partIndex: 0, measureStart: 0, measureEnd: 0 });

    const m0Events = result.parts[0].measures[0].voices[0].events;
    const m1Events = result.parts[0].measures[1].voices[0].events;

    // Measure 0 should be transposed (C4 -> C#4)
    if (m0Events[0].kind === "note") {
      expect(m0Events[0].head.pitch.pitchClass).toBe("C");
      expect(m0Events[0].head.pitch.accidental).toBe("sharp");
    }

    // Measure 1 should be untouched
    if (m1Events[0].kind === "note") {
      expect(m1Events[0].head.pitch.pitchClass).toBe("D");
      expect(m1Events[0].head.pitch.accidental).toBe("natural");
    }
  });
});

describe("Retrograde Plugin", () => {
  it("reverses the order of notes", () => {
    const notes = [makeNote("C", 4), makeNote("D", 4), makeNote("E", 4)];
    const score = makeScoreWithNotes(notes);
    const result = retrogradeScore(score, null);
    const events = result.parts[0].measures[0].voices[0].events;

    expect(events.length).toBe(3);
    if (events[0].kind === "note" && events[1].kind === "note" && events[2].kind === "note") {
      expect(events[0].head.pitch.pitchClass).toBe("E");
      expect(events[1].head.pitch.pitchClass).toBe("D");
      expect(events[2].head.pitch.pitchClass).toBe("C");
    }
  });

  it("handles empty measures", () => {
    const score = makeScoreWithNotes([]);
    const result = retrogradeScore(score, null);
    expect(result.parts[0].measures[0].voices[0].events.length).toBe(0);
  });

  it("preserves durations when reversing", () => {
    const notes = [makeNote("C", 4, "quarter"), makeNote("D", 4, "half")];
    const score = makeScoreWithNotes(notes);
    const result = retrogradeScore(score, null);
    const events = result.parts[0].measures[0].voices[0].events;

    expect(events[0].duration.type).toBe("half");
    expect(events[1].duration.type).toBe("quarter");
  });
});

describe("Augment/Diminish Plugin", () => {
  it("augments a quarter note to a half note", () => {
    const note = makeNote("C", 4, "quarter");
    const result = changeDurationLevel(note, "augment");
    expect(result.duration.type).toBe("half");
  });

  it("diminishes a quarter note to an eighth note", () => {
    const note = makeNote("C", 4, "quarter");
    const result = changeDurationLevel(note, "diminish");
    expect(result.duration.type).toBe("eighth");
  });

  it("does not augment beyond whole note", () => {
    const note = makeNote("C", 4, "whole");
    const result = changeDurationLevel(note, "augment");
    expect(result.duration.type).toBe("whole");
  });

  it("does not diminish beyond 64th note", () => {
    const note = makeNote("C", 4, "64th");
    const result = changeDurationLevel(note, "diminish");
    expect(result.duration.type).toBe("64th");
  });

  it("augments all notes in a score", () => {
    const notes = [makeNote("C", 4, "quarter"), makeNote("D", 4, "eighth")];
    const score = makeScoreWithNotes(notes);
    const result = transformScore(score, "augment", null);
    const events = result.parts[0].measures[0].voices[0].events;

    expect(events[0].duration.type).toBe("half");
    expect(events[1].duration.type).toBe("quarter");
  });

  it("diminishes all notes in a score", () => {
    const notes = [makeNote("C", 4, "half"), makeNote("D", 4, "quarter")];
    const score = makeScoreWithNotes(notes);
    const result = transformScore(score, "diminish", null);
    const events = result.parts[0].measures[0].voices[0].events;

    expect(events[0].duration.type).toBe("quarter");
    expect(events[1].duration.type).toBe("eighth");
  });

  it("handles rests in augmentation", () => {
    const rest = makeRest("quarter");
    const result = changeDurationLevel(rest, "augment");
    expect(result.duration.type).toBe("half");
  });
});

describe("Chord Analysis Plugin", () => {
  it("identifies a C major chord", () => {
    // C=0, E=4, G=7
    const result = identifyChord([60, 64, 67]);
    expect(result).toBe("C");
  });

  it("identifies a D minor chord", () => {
    // D=2, F=5, A=9
    const result = identifyChord([62, 65, 69]);
    expect(result).toBe("Dmin");
  });

  it("identifies a G dominant 7th chord", () => {
    // G=7, B=11, D=14(2), F=17(5)
    const result = identifyChord([55, 59, 62, 65]);
    expect(result).toBe("G7");
  });

  it("returns null for single notes", () => {
    const result = identifyChord([60]);
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    const result = identifyChord([]);
    expect(result).toBeNull();
  });
});
