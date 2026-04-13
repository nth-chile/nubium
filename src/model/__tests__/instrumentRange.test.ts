import { describe, it, expect } from "vitest";
import { pitchToMidi } from "../pitch";
import { INSTRUMENTS, getInstrument } from "../instruments";
import type { InstrumentDef } from "../instruments";
import type { NoteEvent } from "../note";
import { factory } from "..";

/**
 * Tests for #225 — Out-of-range note visual warning.
 *
 * The renderer uses pitchToMidi + instrument min/maxPitch to flag notes.
 * This file tests the pure isOutOfRange logic extracted from vexBridge.ts,
 * plus validates instrument range data integrity.
 */

/** Replicates the isOutOfRange closure from vexBridge.ts line ~843 */
function isOutOfRange(
  event: NoteEvent | undefined,
  instrument: InstrumentDef,
): boolean {
  const { minPitch, maxPitch } = instrument;
  if (minPitch == null || maxPitch == null || !event) return false;

  if (event.kind === "note") {
    const midi = pitchToMidi(event.head.pitch);
    return midi < minPitch || midi > maxPitch;
  }
  if (event.kind === "chord") {
    return event.heads.some((h) => {
      const midi = pitchToMidi(h.pitch);
      return midi < minPitch || midi > maxPitch;
    });
  }
  if (event.kind === "grace") {
    const midi = pitchToMidi(event.head.pitch);
    return midi < minPitch || midi > maxPitch;
  }
  return false;
}

describe("instrument range data integrity", () => {
  it("all non-percussion instruments have minPitch and maxPitch", () => {
    for (const inst of INSTRUMENTS) {
      if (inst.id === "drums") continue;
      expect(inst.minPitch, `${inst.name} missing minPitch`).toBeDefined();
      expect(inst.maxPitch, `${inst.name} missing maxPitch`).toBeDefined();
    }
  });

  it("minPitch < maxPitch for all instruments with ranges", () => {
    for (const inst of INSTRUMENTS) {
      if (inst.minPitch != null && inst.maxPitch != null) {
        expect(inst.minPitch).toBeLessThan(inst.maxPitch);
      }
    }
  });

  it("drums have no pitch range", () => {
    const drums = getInstrument("drums");
    expect(drums).toBeDefined();
    expect(drums!.minPitch).toBeUndefined();
    expect(drums!.maxPitch).toBeUndefined();
  });
});

describe("isOutOfRange — single notes", () => {
  const violin = getInstrument("violin")!;
  // Violin: minPitch=55 (G3), maxPitch=103 (G7)

  it("in-range note returns false", () => {
    const note = factory.note("A", 4, factory.dur("quarter")); // MIDI 69
    expect(isOutOfRange(note, violin)).toBe(false);
  });

  it("note at exact minPitch boundary returns false", () => {
    const note = factory.note("G", 3, factory.dur("quarter")); // MIDI 55
    expect(isOutOfRange(note, violin)).toBe(false);
  });

  it("note at exact maxPitch boundary returns false", () => {
    const note = factory.note("G", 7, factory.dur("quarter")); // MIDI 103
    expect(isOutOfRange(note, violin)).toBe(false);
  });

  it("note below minPitch returns true", () => {
    const note = factory.note("C", 3, factory.dur("quarter")); // MIDI 48
    expect(isOutOfRange(note, violin)).toBe(true);
  });

  it("note above maxPitch returns true", () => {
    const note = factory.note("A", 7, factory.dur("quarter")); // MIDI 105
    expect(isOutOfRange(note, violin)).toBe(true);
  });

  it("note one semitone below minPitch returns true", () => {
    // Violin minPitch = 55 (G3), so F#3 = MIDI 54
    const note = factory.note("F", 3, factory.dur("quarter"), "sharp"); // MIDI 54
    expect(isOutOfRange(note, violin)).toBe(true);
  });

  it("note one semitone above maxPitch returns true", () => {
    // Violin maxPitch = 103 (G7), so G#7 = MIDI 104
    const note = factory.note("G", 7, factory.dur("quarter"), "sharp"); // MIDI 104
    expect(isOutOfRange(note, violin)).toBe(true);
  });
});

describe("isOutOfRange — chords", () => {
  const piano = getInstrument("piano")!;
  // Piano: minPitch=21 (A0), maxPitch=108 (C8)

  it("chord with all in-range notes returns false", () => {
    const ch = factory.chord(
      [factory.noteHead("C", 4), factory.noteHead("E", 4), factory.noteHead("G", 4)],
      factory.dur("quarter"),
    );
    expect(isOutOfRange(ch, piano)).toBe(false);
  });

  it("chord with one out-of-range note returns true", () => {
    const ch = factory.chord(
      [factory.noteHead("C", 4), factory.noteHead("C", 9)], // C9 = MIDI 120, way above 108
      factory.dur("quarter"),
    );
    expect(isOutOfRange(ch, piano)).toBe(true);
  });
});

describe("isOutOfRange — grace notes", () => {
  const flute = getInstrument("flute")!;
  // Flute: minPitch=60 (C4), maxPitch=96 (C7)

  it("in-range grace note returns false", () => {
    const grace = factory.graceNote("D", 5);
    expect(isOutOfRange(grace, flute)).toBe(false);
  });

  it("out-of-range grace note returns true", () => {
    const grace = factory.graceNote("B", 3); // MIDI 59, below 60
    expect(isOutOfRange(grace, flute)).toBe(true);
  });
});

describe("isOutOfRange — rests and undefined", () => {
  const violin = getInstrument("violin")!;

  it("rest is never out of range", () => {
    const r = factory.rest(factory.dur("quarter"));
    expect(isOutOfRange(r, violin)).toBe(false);
  });

  it("undefined event returns false", () => {
    expect(isOutOfRange(undefined, violin)).toBe(false);
  });
});

describe("isOutOfRange — instrument without range (drums)", () => {
  const drums = getInstrument("drums")!;

  it("any note is in-range when instrument has no range", () => {
    const note = factory.note("C", 0, factory.dur("quarter"));
    expect(isOutOfRange(note, drums)).toBe(false);
  });
});

describe("pitchToMidi spot checks for range boundaries", () => {
  it("A0 = MIDI 21 (piano low)", () => {
    expect(pitchToMidi({ pitchClass: "A", accidental: "natural", octave: 0 })).toBe(21);
  });

  it("C8 = MIDI 108 (piano high)", () => {
    expect(pitchToMidi({ pitchClass: "C", accidental: "natural", octave: 8 })).toBe(108);
  });

  it("G3 = MIDI 55 (violin low)", () => {
    expect(pitchToMidi({ pitchClass: "G", accidental: "natural", octave: 3 })).toBe(55);
  });

  it("C4 = MIDI 60 (middle C / flute low)", () => {
    expect(pitchToMidi({ pitchClass: "C", accidental: "natural", octave: 4 })).toBe(60);
  });

  it("accidentals shift MIDI correctly", () => {
    expect(pitchToMidi({ pitchClass: "F", accidental: "sharp", octave: 3 })).toBe(54);
    expect(pitchToMidi({ pitchClass: "B", accidental: "flat", octave: 3 })).toBe(58);
  });
});
