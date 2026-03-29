import { describe, it, expect } from "vitest";
import { validateMeasure, formatValidationErrors } from "../validate";
import { factory } from "../../model";
import type { Measure } from "../../model";
import { newId, type MeasureId, type VoiceId, type NoteEventId } from "../../model/ids";

function makeMeasure(events: Parameters<typeof factory.voice>[0], timeSig = { numerator: 4, denominator: 4 }): Measure {
  return {
    id: newId<MeasureId>("msr"),
    clef: { type: "treble" },
    timeSignature: timeSig,
    keySignature: { fifths: 0 },
    barlineEnd: "single" as const,
    annotations: [],
    voices: [{ id: newId<VoiceId>("vce"), events }],
  };
}

describe("validateMeasure", () => {
  it("returns no errors for a valid measure", () => {
    const m = makeMeasure([
      factory.note("C", 4, factory.dur("quarter")),
      factory.note("D", 4, factory.dur("quarter")),
      factory.note("E", 4, factory.dur("quarter")),
      factory.note("F", 4, factory.dur("quarter")),
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors).toHaveLength(0);
  });

  it("returns no errors for an empty measure", () => {
    const m = makeMeasure([]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors).toHaveLength(0);
  });

  it("returns no errors for an underfull measure (pickup bar)", () => {
    const m = makeMeasure([
      factory.note("C", 4, factory.dur("quarter")),
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors).toHaveLength(0);
  });

  it("detects overfull measure", () => {
    const m = makeMeasure([
      factory.note("C", 4, factory.dur("whole")),
      factory.note("D", 4, factory.dur("whole")),
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes("ticks"))).toBe(true);
  });

  it("detects invalid duration type", () => {
    const m = makeMeasure([
      {
        kind: "note" as const,
        id: newId<NoteEventId>("evt"),
        duration: { type: "invalid" as any, dots: 0 },
        head: { pitch: { pitchClass: "C" as const, accidental: "natural" as const, octave: 4 as const } },
      },
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors.some((e) => e.message.includes('duration'))).toBe(true);
  });

  it("detects invalid pitch class", () => {
    const m = makeMeasure([
      {
        kind: "note" as const,
        id: newId<NoteEventId>("evt"),
        duration: { type: "quarter" as const, dots: 0 },
        head: { pitch: { pitchClass: "X" as any, accidental: "natural" as const, octave: 4 as const } },
      },
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors.some((e) => e.message.includes("pitch class"))).toBe(true);
  });

  it("detects invalid octave", () => {
    const m = makeMeasure([
      {
        kind: "note" as const,
        id: newId<NoteEventId>("evt"),
        duration: { type: "quarter" as const, dots: 0 },
        head: { pitch: { pitchClass: "C" as const, accidental: "natural" as const, octave: 15 as any } },
      },
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors.some((e) => e.message.includes("octave"))).toBe(true);
  });

  it("validates chord events", () => {
    const m = makeMeasure([
      {
        kind: "chord" as const,
        id: newId<NoteEventId>("evt"),
        duration: { type: "quarter" as const, dots: 0 },
        heads: [
          { pitch: { pitchClass: "Z" as any, accidental: "natural" as const, octave: 4 as const } },
        ],
      },
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors.some((e) => e.message.includes("pitch class"))).toBe(true);
  });

  it("validates 3/4 time capacity", () => {
    const m = makeMeasure(
      [
        factory.note("C", 4, factory.dur("whole")),
      ],
      { numerator: 3, denominator: 4 }
    );
    const errors = validateMeasure(m, 1, 0);
    expect(errors.some((e) => e.message.includes("ticks"))).toBe(true);
  });

  it("accepts valid rests", () => {
    const m = makeMeasure([
      factory.rest(factory.dur("whole")),
    ]);
    const errors = validateMeasure(m, 1, 0);
    expect(errors).toHaveLength(0);
  });
});

describe("formatValidationErrors", () => {
  it("returns empty string for no errors", () => {
    expect(formatValidationErrors([])).toBe("");
  });

  it("formats single error", () => {
    const result = formatValidationErrors([
      { measureNumber: 1, partIndex: 0, voiceIndex: 0, message: "Too many notes" },
    ]);
    expect(result).toContain("1 issue");
    expect(result).toContain("Measure 1");
    expect(result).toContain("Too many notes");
  });

  it("formats multiple errors", () => {
    const result = formatValidationErrors([
      { measureNumber: 1, partIndex: 0, voiceIndex: 0, message: "Error 1" },
      { measureNumber: 2, partIndex: 0, voiceIndex: 0, message: "Error 2" },
    ]);
    expect(result).toContain("2 issues");
    expect(result).toContain("Error 1");
    expect(result).toContain("Error 2");
  });
});
