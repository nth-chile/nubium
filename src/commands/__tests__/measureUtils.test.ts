import { describe, it, expect } from "vitest";
import { resolveVoiceForStaff, appendMeasureToAllParts } from "../measureUtils";
import { factory } from "../../model";

describe("resolveVoiceForStaff", () => {
  it("returns current voiceIndex when it already matches the staff", () => {
    const m = factory.measure([factory.voice([])]);
    // Default staff is 0 (undefined → 0)
    const result = resolveVoiceForStaff(m, 0, 0);
    expect(result).toBe(0);
  });

  it("finds existing voice on target staff", () => {
    const m = factory.measure([factory.voice([]), factory.voice([])]);
    m.voices[0].staff = 0;
    m.voices[1].staff = 1;
    // voiceIndex 0 is on staff 0, we want staff 1
    const result = resolveVoiceForStaff(m, 0, 1);
    expect(result).toBe(1);
  });

  it("creates new voice when no voice exists on target staff", () => {
    const m = factory.measure([factory.voice([])]);
    m.voices[0].staff = 0;
    const result = resolveVoiceForStaff(m, 0, 1);
    expect(result).toBe(1);
    expect(m.voices).toHaveLength(2);
    expect(m.voices[1].staff).toBe(1);
    expect(m.voices[1].events).toEqual([]);
  });
});

describe("appendMeasureToAllParts", () => {
  it("appends a measure to each part", () => {
    const score = factory.score("Test", "", [
      factory.part("Piano", "Pno.", [factory.measure([factory.voice([])])]),
      factory.part("Guitar", "Gtr.", [factory.measure([factory.voice([])])]),
    ]);

    expect(score.parts[0].measures).toHaveLength(1);
    expect(score.parts[1].measures).toHaveLength(1);

    appendMeasureToAllParts(score);

    expect(score.parts[0].measures).toHaveLength(2);
    expect(score.parts[1].measures).toHaveLength(2);
  });

  it("copies time/key/clef from last measure", () => {
    const m = factory.measure([factory.voice([])], {
      timeSignature: { numerator: 3, denominator: 4 },
      keySignature: { fifths: 2 },
      clef: { type: "bass" },
    });
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    appendMeasureToAllParts(score);

    const newMeasure = score.parts[0].measures[1];
    expect(newMeasure.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(newMeasure.keySignature).toEqual({ fifths: 2 });
    expect(newMeasure.clef).toEqual({ type: "bass" });
    expect(newMeasure.barlineEnd).toBe("single");
    expect(newMeasure.annotations).toEqual([]);
  });

  it("creates matching number of voices with staff assignments", () => {
    const m = factory.measure([factory.voice([]), factory.voice([])]);
    m.voices[0].staff = 0;
    m.voices[1].staff = 1;
    const score = factory.score("Test", "", [factory.part("P", "P", [m])]);

    appendMeasureToAllParts(score);

    const newMeasure = score.parts[0].measures[1];
    expect(newMeasure.voices).toHaveLength(2);
    expect(newMeasure.voices[0].staff).toBe(0);
    expect(newMeasure.voices[1].staff).toBe(1);
    expect(newMeasure.voices[0].events).toEqual([]);
    expect(newMeasure.voices[1].events).toEqual([]);
  });
});
