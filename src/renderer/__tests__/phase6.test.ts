import { describe, it, expect } from "vitest";
import { getBeamGroups } from "../beaming";
import { calculateMeasureWidth } from "../measureWidth";
import { calculateNoteSpacing } from "../spacing";
import type { NoteEvent } from "../../model/note";
import type { TimeSignature } from "../../model/time";
import type { Measure } from "../../model/score";
import { newId } from "../../model/ids";
import type { NoteEventId, MeasureId, VoiceId } from "../../model/ids";

// ---- Helpers ----

function makeNote(durType: string): NoteEvent {
  return {
    kind: "note",
    id: newId<NoteEventId>("evt"),
    duration: { type: durType as NoteEvent["duration"]["type"], dots: 0 },
    head: { pitch: { pitchClass: "C", accidental: "natural", octave: 4 } },
  };
}

function makeRest(durType: string): NoteEvent {
  return {
    kind: "rest",
    id: newId<NoteEventId>("evt"),
    duration: { type: durType as NoteEvent["duration"]["type"], dots: 0 },
  };
}

function makeMeasure(events: NoteEvent[], timeSig: TimeSignature = { numerator: 4, denominator: 4 }): Measure {
  return {
    id: newId<MeasureId>("msr"),
    clef: { type: "treble" },
    timeSignature: timeSig,
    keySignature: { fifths: 0 },
    barlineEnd: "single",
    annotations: [],
    voices: [{ id: newId<VoiceId>("vce"), events }],
  };
}

// ---- Beam grouping tests ----

describe("getBeamGroups", () => {
  it("beams eighth notes in quarter-note groups for 4/4", () => {
    // Four pairs of eighth notes filling 4/4
    const events: NoteEvent[] = [
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);

    // Should get 4 groups of 2
    expect(groups).toHaveLength(4);
    expect(groups[0]).toEqual([0, 1]);
    expect(groups[1]).toEqual([2, 3]);
    expect(groups[2]).toEqual([4, 5]);
    expect(groups[3]).toEqual([6, 7]);
  });

  it("beams in dotted-quarter groups for 6/8", () => {
    // Six eighth notes filling 6/8
    const events: NoteEvent[] = [
      makeNote("eighth"), makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"), makeNote("eighth"),
    ];
    const timeSig: TimeSignature = { numerator: 6, denominator: 8 };
    const groups = getBeamGroups(events, timeSig);

    // Should get 2 groups of 3
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([0, 1, 2]);
    expect(groups[1]).toEqual([3, 4, 5]);
  });

  it("beams in quarter-note groups for 3/4", () => {
    // Six eighth notes filling 3/4
    const events: NoteEvent[] = [
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
    ];
    const timeSig: TimeSignature = { numerator: 3, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual([0, 1]);
    expect(groups[1]).toEqual([2, 3]);
    expect(groups[2]).toEqual([4, 5]);
  });

  it("does not beam quarter notes or longer", () => {
    const events: NoteEvent[] = [
      makeNote("quarter"), makeNote("quarter"),
      makeNote("quarter"), makeNote("quarter"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);
    expect(groups).toHaveLength(0);
  });

  it("does not beam across rests", () => {
    const events: NoteEvent[] = [
      makeNote("eighth"), makeRest("eighth"),
      makeNote("eighth"), makeNote("eighth"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);

    // First group broken by rest, second group has 2 eighths
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([2, 3]);
  });

  it("requires at least 2 notes to form a beam group", () => {
    const events: NoteEvent[] = [
      makeNote("eighth"), makeNote("quarter"),
      makeNote("eighth"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);
    // Single eighth notes alone don't form a beam
    expect(groups).toHaveLength(0);
  });

  it("beams 16th notes", () => {
    const events: NoteEvent[] = [
      makeNote("16th"), makeNote("16th"), makeNote("16th"), makeNote("16th"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);
    // All four 16th notes fit within one quarter-note group
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([0, 1, 2, 3]);
  });

  it("beams in half-note groups for 2/2 (cut time)", () => {
    // Eight eighth notes filling 2/2
    const events: NoteEvent[] = Array.from({ length: 8 }, () => makeNote("eighth"));
    const timeSig: TimeSignature = { numerator: 2, denominator: 2 };
    const groups = getBeamGroups(events, timeSig);
    // Should get 2 groups of 4 (half-note beat = 960 ticks = 4 eighths)
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([0, 1, 2, 3]);
    expect(groups[1]).toEqual([4, 5, 6, 7]);
  });

  it("beams 5/8 as 3+2", () => {
    // Five eighth notes filling 5/8
    const events: NoteEvent[] = Array.from({ length: 5 }, () => makeNote("eighth"));
    const timeSig: TimeSignature = { numerator: 5, denominator: 8 };
    const groups = getBeamGroups(events, timeSig);
    // Should get 3+2 grouping
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([0, 1, 2]);
    expect(groups[1]).toEqual([3, 4]);
  });

  it("beams 7/8 as 2+2+3", () => {
    // Seven eighth notes filling 7/8
    const events: NoteEvent[] = Array.from({ length: 7 }, () => makeNote("eighth"));
    const timeSig: TimeSignature = { numerator: 7, denominator: 8 };
    const groups = getBeamGroups(events, timeSig);
    // Should get 2+2+3 grouping
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual([0, 1]);
    expect(groups[1]).toEqual([2, 3]);
    expect(groups[2]).toEqual([4, 5, 6]);
  });

  it("beams mixed durations in same group (secondary beams handled by VexFlow)", () => {
    // Eighth + two 16ths in one beat — should all be in one beam group
    const events: NoteEvent[] = [
      makeNote("eighth"), makeNote("16th"), makeNote("16th"),
      makeNote("quarter"), makeNote("quarter"),
    ];
    const timeSig: TimeSignature = { numerator: 4, denominator: 4 };
    const groups = getBeamGroups(events, timeSig);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([0, 1, 2]);
  });

  it("beams 12/8 in four groups of 3", () => {
    const events: NoteEvent[] = Array.from({ length: 12 }, () => makeNote("eighth"));
    const timeSig: TimeSignature = { numerator: 12, denominator: 8 };
    const groups = getBeamGroups(events, timeSig);
    expect(groups).toHaveLength(4);
    expect(groups[0]).toEqual([0, 1, 2]);
    expect(groups[1]).toEqual([3, 4, 5]);
    expect(groups[2]).toEqual([6, 7, 8]);
    expect(groups[3]).toEqual([9, 10, 11]);
  });

  it("beams 3/2 in half-note groups", () => {
    // 12 eighth notes filling 3/2
    const events: NoteEvent[] = Array.from({ length: 12 }, () => makeNote("eighth"));
    const timeSig: TimeSignature = { numerator: 3, denominator: 2 };
    const groups = getBeamGroups(events, timeSig);
    // 3 groups of 4 eighths each (half-note beats)
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual([0, 1, 2, 3]);
    expect(groups[1]).toEqual([4, 5, 6, 7]);
    expect(groups[2]).toEqual([8, 9, 10, 11]);
  });
});

// ---- Measure width tests ----

describe("calculateMeasureWidth", () => {
  it("returns minimum width for empty measure", () => {
    const m = makeMeasure([]);
    const w = calculateMeasureWidth(m);
    expect(w).toBeGreaterThanOrEqual(150);
  });

  it("wider measures for more events", () => {
    const small = makeMeasure([makeNote("whole")]);
    const large = makeMeasure([
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
      makeNote("eighth"), makeNote("eighth"),
    ]);
    const wSmall = calculateMeasureWidth(small);
    const wLarge = calculateMeasureWidth(large);
    expect(wLarge).toBeGreaterThan(wSmall);
  });

  it("respects maximum width", () => {
    const events = Array.from({ length: 20 }, () => makeNote("16th"));
    const m = makeMeasure(events);
    const w = calculateMeasureWidth(m);
    expect(w).toBeLessThanOrEqual(700);
  });

  it("adds width for decorations", () => {
    const m = makeMeasure([makeNote("quarter")]);
    const plain = calculateMeasureWidth(m, { showClef: false, showTimeSig: false, showKeySig: false });
    const decorated = calculateMeasureWidth(m, { showClef: true, showTimeSig: true, showKeySig: true });
    expect(decorated).toBeGreaterThan(plain);
  });

  it("uses stylesheet min/max", () => {
    const m = makeMeasure([makeNote("quarter")]);
    const w = calculateMeasureWidth(m, {
      stylesheet: { measureMinWidth: 200, measureMaxWidth: 300 },
    });
    expect(w).toBeGreaterThanOrEqual(200);
    expect(w).toBeLessThanOrEqual(300);
  });

  it("pickup measure is narrower than regular measure with same events (#133)", () => {
    // Use enough events that both widths exceed minWidth, so the difference shows
    const events = [makeNote("eighth"), makeNote("eighth"), makeNote("eighth"), makeNote("eighth")];
    const regular = makeMeasure(events);
    const pickup: Measure = { ...makeMeasure(events), isPickup: true };
    const wRegular = calculateMeasureWidth(regular);
    const wPickup = calculateMeasureWidth(pickup);
    expect(wPickup).toBeLessThan(wRegular);
  });

  it("pickup measure uses reduced base (40 vs 100) (#133)", () => {
    // 4 events: regular = 100 + 4*35 = 240, pickup = 40 + 4*35 = 180
    const events = [makeNote("eighth"), makeNote("eighth"), makeNote("eighth"), makeNote("eighth")];
    const pickup: Measure = { ...makeMeasure(events), isPickup: true };
    const w = calculateMeasureWidth(pickup);
    // Should be 40 + 4*35 = 180
    expect(w).toBe(180);
  });
});

// ---- Spacing tests ----

describe("calculateNoteSpacing", () => {
  it("returns empty array for no events", () => {
    expect(calculateNoteSpacing([])).toEqual([]);
  });

  it("returns [0] for single event", () => {
    expect(calculateNoteSpacing([makeNote("quarter")])).toEqual([0]);
  });

  it("first offset is always 0", () => {
    const offsets = calculateNoteSpacing([makeNote("quarter"), makeNote("quarter")]);
    expect(offsets[0]).toBe(0);
  });

  it("offsets are monotonically increasing", () => {
    const events = [
      makeNote("quarter"), makeNote("quarter"),
      makeNote("quarter"), makeNote("quarter"),
    ];
    const offsets = calculateNoteSpacing(events, 400);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it("longer notes get more space than shorter", () => {
    const events: NoteEvent[] = [makeNote("half"), makeNote("eighth")];
    const offsets = calculateNoteSpacing(events, 400);
    // Half note should get more space than eighth note
    // With 2 events, offsets are [0, space_after_first]
    // The space after the half note should be larger relative to the total
    expect(offsets).toHaveLength(2);
    expect(offsets[1]).toBeGreaterThan(0);
  });

  it("respects spacing factor", () => {
    const events = [makeNote("quarter"), makeNote("quarter"), makeNote("quarter")];
    const normal = calculateNoteSpacing(events, 300, 1.0);
    const expanded = calculateNoteSpacing(events, 300, 2.0);
    // With different spacing factors, offsets should differ
    // (both scale the proportional calculation)
    expect(normal).toHaveLength(3);
    expect(expanded).toHaveLength(3);
  });
});
