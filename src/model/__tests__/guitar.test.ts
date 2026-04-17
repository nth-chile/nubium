import { describe, it, expect } from "vitest";
import {
  pitchToTab,
  STANDARD_TUNING,
  DROP_D_TUNING,
  ALL_TUNINGS,
} from "../guitar";
import type { Pitch } from "../pitch";

function p(pitchClass: Pitch["pitchClass"], octave: Pitch["octave"], accidental: Pitch["accidental"] = "natural"): Pitch {
  return { pitchClass, accidental, octave };
}

describe("pitchToTab – standard tuning", () => {
  it("maps open low E string (E2)", () => {
    const result = pitchToTab(p("E", 2), STANDARD_TUNING);
    expect(result.fret).toBe(0);
    expect(result.string).toBe(6);
  });

  it("maps middle C (C4) – typically string 2 fret 1", () => {
    const result = pitchToTab(p("C", 4), STANDARD_TUNING);
    // C4 = MIDI 60, string 2 (B3=59) → fret 1
    expect(result.string).toBe(2);
    expect(result.fret).toBe(1);
  });

  it("maps open high E string (E4)", () => {
    const result = pitchToTab(p("E", 4), STANDARD_TUNING);
    expect(result.fret).toBe(0);
    expect(result.string).toBe(1);
  });

  it("maps A2 to open A string", () => {
    const result = pitchToTab(p("A", 2), STANDARD_TUNING);
    expect(result.fret).toBe(0);
    expect(result.string).toBe(5);
  });

  it("prefers lower frets over higher frets", () => {
    // G3 can be played on string 3 fret 0, string 4 fret 5, string 5 fret 10
    const result = pitchToTab(p("G", 3), STANDARD_TUNING);
    expect(result.fret).toBe(0);
    expect(result.string).toBe(3);
  });

  it("handles high pitch requiring high fret", () => {
    // A5 = MIDI 81, only reachable on string 1 (E4=64) fret 17
    const result = pitchToTab(p("A", 5), STANDARD_TUNING);
    expect(result.fret).toBe(17);
    expect(result.string).toBe(1);
  });

  it("handles accidentals", () => {
    // F#4 = MIDI 66, string 1 fret 2
    const result = pitchToTab(p("F", 4, "sharp"), STANDARD_TUNING);
    expect(result.fret).toBe(2);
    expect(result.string).toBe(1);
  });
});

describe("pitchToTab – drop D tuning", () => {
  it("maps D2 to open 6th string in drop D", () => {
    const result = pitchToTab(p("D", 2), DROP_D_TUNING);
    expect(result.fret).toBe(0);
    expect(result.string).toBe(6);
  });

  it("E2 is fret 2 on 6th string in drop D", () => {
    const result = pitchToTab(p("E", 2), DROP_D_TUNING);
    expect(result.string).toBe(6);
    expect(result.fret).toBe(2);
  });
});

describe("ALL_TUNINGS", () => {
  it("contains 6 tunings", () => {
    expect(ALL_TUNINGS).toHaveLength(6);
  });

  it("each tuning has 6 strings", () => {
    for (const tuning of ALL_TUNINGS) {
      expect(tuning.strings).toHaveLength(6);
      expect(tuning.name).toBeTruthy();
    }
  });

  it("strings are ordered low to high", () => {
    for (const tuning of ALL_TUNINGS) {
      for (let i = 1; i < tuning.strings.length; i++) {
        expect(tuning.strings[i]).toBeGreaterThanOrEqual(tuning.strings[i - 1]);
      }
    }
  });
});
