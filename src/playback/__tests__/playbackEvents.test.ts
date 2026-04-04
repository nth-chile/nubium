import { describe, it, expect } from "vitest";
import { getScoreDuration, calculateSwingTick } from "../TonePlayback";
import { TICKS_PER_QUARTER } from "../../model/duration";
import { factory } from "../../model";
import type { SwingSettings } from "../../model/annotations";

describe("getScoreDuration", () => {
  it("returns one measure duration for an empty score (measure 0 always counted)", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([factory.voice([])]),
      ]),
    ]);
    score.tempo = 120;
    // findLastContentMeasure returns 0, so measure 0 is always iterated
    // 4/4 at 120 BPM = 2 seconds
    expect(getScoreDuration(score)).toBe(2);
  });

  it("returns correct duration for one measure of quarter notes at 120 BPM", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            factory.note("F", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    score.tempo = 120;
    // 4 quarter notes at 120 BPM = 1 measure = 4 beats = 2 seconds
    expect(getScoreDuration(score)).toBe(2);
  });

  it("returns correct duration for multiple measures", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            factory.note("F", 4, factory.dur("quarter")),
          ]),
        ]),
        factory.measure([
          factory.voice([
            factory.note("G", 4, factory.dur("half")),
            factory.note("A", 4, factory.dur("half")),
          ]),
        ]),
      ]),
    ]);
    score.tempo = 120;
    // 2 measures at 120 BPM = 8 beats = 4 seconds
    expect(getScoreDuration(score)).toBe(4);
  });

  it("skips trailing empty measures", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("whole")),
          ]),
        ]),
        factory.measure([factory.voice([])]),
        factory.measure([factory.voice([])]),
      ]),
    ]);
    score.tempo = 120;
    // Only 1 measure with content = 4 beats at 120 BPM = 2 seconds
    expect(getScoreDuration(score)).toBe(2);
  });

  it("respects score.tempo instead of stale global state", () => {
    const score = factory.score("", "", [
      factory.part("P", "P", [
        factory.measure([
          factory.voice([
            factory.note("C", 4, factory.dur("quarter")),
            factory.note("D", 4, factory.dur("quarter")),
            factory.note("E", 4, factory.dur("quarter")),
            factory.note("F", 4, factory.dur("quarter")),
          ]),
        ]),
      ]),
    ]);
    score.tempo = 60;
    // 4 quarter notes at 60 BPM = 4 seconds
    expect(getScoreDuration(score)).toBe(4);
  });

  it("tempo mark persists to subsequent measures", () => {
    const m1 = factory.measure([
      factory.voice([factory.note("C", 4, factory.dur("whole"))]),
    ]);
    m1.annotations.push({ kind: "tempo-mark", bpm: 60, beatUnit: "quarter" });

    const m2 = factory.measure([
      factory.voice([factory.note("D", 4, factory.dur("whole"))]),
    ]);
    // m2 has no tempo mark — should inherit 60 BPM from m1

    const score = factory.score("", "", [factory.part("P", "P", [m1, m2])]);
    score.tempo = 120;
    // m1: 4 beats at 60 BPM = 4 sec, m2: 4 beats at 60 BPM (inherited) = 4 sec → total 8 sec
    expect(getScoreDuration(score)).toBe(8);
  });
});

describe("calculateSwingTick", () => {
  const BEAT = TICKS_PER_QUARTER; // 480

  it("leaves downbeat notes unchanged", () => {
    const swing: SwingSettings = { style: "swing", ratio: 2 };
    expect(calculateSwingTick(0, swing, BEAT)).toBe(0);
    expect(calculateSwingTick(BEAT, swing, BEAT)).toBe(BEAT);
    expect(calculateSwingTick(BEAT * 2, swing, BEAT)).toBe(BEAT * 2);
  });

  it("delays offbeat eighth with triplet swing (2:1)", () => {
    const swing: SwingSettings = { style: "swing", ratio: 2 };
    // Offbeat eighth at tick 240 (half a beat) → should shift to 320 (2/3 of beat)
    const result = calculateSwingTick(240, swing, BEAT);
    expect(result).toBe(320);
  });

  it("delays offbeat eighth with hard swing (3:1)", () => {
    const swing: SwingSettings = { style: "swing", ratio: 3 };
    // Offbeat eighth at tick 240 → should shift to 360 (3/4 of beat)
    const result = calculateSwingTick(240, swing, BEAT);
    expect(result).toBe(360);
  });

  it("returns unchanged tick for straight style", () => {
    const swing: SwingSettings = { style: "straight" };
    expect(calculateSwingTick(240, swing, BEAT)).toBe(240);
  });

  it("handles second beat offbeat correctly", () => {
    const swing: SwingSettings = { style: "swing", ratio: 2 };
    // Beat 2 offbeat = tick 720 (480 + 240) → should shift to 480 + 320 = 800
    expect(calculateSwingTick(720, swing, BEAT)).toBe(800);
  });

  it("swings sixteenths when subdivision is sixteenth", () => {
    const swing: SwingSettings = { style: "swing", ratio: 2, subdivision: "sixteenth" };
    // Sixteenth swing unit = 120 (quarter of a beat)
    // First offbeat sixteenth at tick 120 → shifts to 160 (2/3 of 240)
    expect(calculateSwingTick(120, swing, BEAT)).toBe(160);
    // Downbeat sixteenth stays
    expect(calculateSwingTick(0, swing, BEAT)).toBe(0);
    // Third sixteenth (second pair, downbeat) stays at 240
    expect(calculateSwingTick(240, swing, BEAT)).toBe(240);
  });

  it("shuffle uses hard swing ratio", () => {
    const swing: SwingSettings = { style: "shuffle", ratio: 3 };
    // Same math as hard swing
    expect(calculateSwingTick(240, swing, BEAT)).toBe(360);
  });

  it("defaults to ratio 2 when ratio is omitted", () => {
    const swing: SwingSettings = { style: "swing" };
    expect(calculateSwingTick(240, swing, BEAT)).toBe(320);
  });
});
