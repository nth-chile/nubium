import { describe, it, expect } from "vitest";
import {
  durationToTicks,
  measureCapacity,
  voiceTicksUsed,
  ticksToDurations,
  TICKS_PER_QUARTER,
  DURATION_TYPES_ORDERED,
} from "../duration";

describe("durationToTicks", () => {
  it("returns correct ticks for all base durations", () => {
    expect(durationToTicks({ type: "whole", dots: 0 })).toBe(1920);
    expect(durationToTicks({ type: "half", dots: 0 })).toBe(960);
    expect(durationToTicks({ type: "quarter", dots: 0 })).toBe(480);
    expect(durationToTicks({ type: "eighth", dots: 0 })).toBe(240);
    expect(durationToTicks({ type: "16th", dots: 0 })).toBe(120);
    expect(durationToTicks({ type: "32nd", dots: 0 })).toBe(60);
    expect(durationToTicks({ type: "64th", dots: 0 })).toBe(30);
  });

  it("handles single dot (1.5x)", () => {
    expect(durationToTicks({ type: "quarter", dots: 1 })).toBe(720);
    expect(durationToTicks({ type: "half", dots: 1 })).toBe(1440);
    expect(durationToTicks({ type: "eighth", dots: 1 })).toBe(360);
  });

  it("handles double dot (1.75x)", () => {
    expect(durationToTicks({ type: "half", dots: 2 })).toBe(960 + 480 + 240);
    expect(durationToTicks({ type: "quarter", dots: 2 })).toBe(480 + 240 + 120);
  });

  it("handles triple dot (1.875x)", () => {
    // whole: 1920 + 960 + 480 + 240 = 3600
    expect(durationToTicks({ type: "whole", dots: 3 })).toBe(3600);
  });

  it("applies tuplet ratio", () => {
    // Triplet: 3 in the space of 2
    const tripletQuarter = durationToTicks({ type: "quarter", dots: 0 }, { actual: 3, normal: 2 });
    expect(tripletQuarter).toBe(Math.round((480 * 2) / 3)); // 320
  });

  it("applies quintuplet ratio", () => {
    // 5 in the space of 4
    const result = durationToTicks({ type: "eighth", dots: 0 }, { actual: 5, normal: 4 });
    expect(result).toBe(Math.round((240 * 4) / 5)); // 192
  });
});

describe("measureCapacity", () => {
  it("returns correct ticks for common time signatures", () => {
    expect(measureCapacity(4, 4)).toBe(1920);
    expect(measureCapacity(3, 4)).toBe(1440);
    expect(measureCapacity(2, 4)).toBe(960);
    expect(measureCapacity(6, 8)).toBe(1440);
    expect(measureCapacity(2, 2)).toBe(1920);
    expect(measureCapacity(3, 8)).toBe(720);
    expect(measureCapacity(5, 4)).toBe(2400);
    expect(measureCapacity(7, 8)).toBe(1680);
    expect(measureCapacity(12, 8)).toBe(2880);
  });
});

describe("voiceTicksUsed", () => {
  it("sums ticks of all non-grace events", () => {
    const events = [
      { duration: { type: "quarter" as const, dots: 0 as const } },
      { duration: { type: "half" as const, dots: 0 as const } },
      { duration: { type: "eighth" as const, dots: 0 as const } },
    ];
    expect(voiceTicksUsed(events)).toBe(480 + 960 + 240);
  });

  it("skips grace notes (kind=grace)", () => {
    const events = [
      { kind: "grace", duration: { type: "eighth" as const, dots: 0 as const } },
      { duration: { type: "quarter" as const, dots: 0 as const } },
    ];
    expect(voiceTicksUsed(events)).toBe(480);
  });

  it("returns 0 for empty voice", () => {
    expect(voiceTicksUsed([])).toBe(0);
  });

  it("handles dotted durations", () => {
    const events = [
      { duration: { type: "quarter" as const, dots: 1 as const } },
      { duration: { type: "eighth" as const, dots: 0 as const } },
    ];
    expect(voiceTicksUsed(events)).toBe(720 + 240);
  });

  it("handles tuplet events", () => {
    const events = [
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: { actual: 3, normal: 2 } },
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: { actual: 3, normal: 2 } },
      { duration: { type: "quarter" as const, dots: 0 as const }, tuplet: { actual: 3, normal: 2 } },
    ];
    // 3 triplet quarters = 2 regular quarters = 960
    expect(voiceTicksUsed(events)).toBe(320 * 3);
  });
});

describe("ticksToDurations", () => {
  it("returns empty array for 0 or negative ticks", () => {
    expect(ticksToDurations(0)).toEqual([]);
    expect(ticksToDurations(-100)).toEqual([]);
  });

  it("decomposes a whole note (1920 ticks)", () => {
    const result = ticksToDurations(1920);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("whole");
    expect(result[0].dots).toBe(0);
  });

  it("decomposes a dotted quarter (720 ticks)", () => {
    const result = ticksToDurations(720);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("quarter");
    expect(result[0].dots).toBe(1);
  });

  it("decomposes quarter + eighth (720 ticks) as dotted quarter", () => {
    // 720 = dotted quarter, should prefer dotted over split
    const result = ticksToDurations(720);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "quarter", dots: 1 });
  });

  it("decomposes 960 + 480 = 1440 as dotted half", () => {
    const result = ticksToDurations(1440);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "half", dots: 1 });
  });

  it("decomposes ticks that require multiple durations", () => {
    // half + quarter = 960 + 480 = 1440 → should be dotted half
    // half + eighth = 960 + 240 = 1200 → half + eighth (no dotted equivalent)
    const result = ticksToDurations(1200);
    const totalTicks = result.reduce((sum, d) => {
      let t = durationToTicks(d);
      return sum + t;
    }, 0);
    expect(totalTicks).toBe(1200);
  });

  it("decomposes double-dotted half (1680 ticks)", () => {
    const result = ticksToDurations(1680);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: "half", dots: 2 });
  });

  it("roundtrips: durations sum back to original ticks", () => {
    const testValues = [30, 60, 120, 240, 360, 480, 720, 840, 960, 1200, 1440, 1680, 1920];
    for (const ticks of testValues) {
      const durations = ticksToDurations(ticks);
      const total = durations.reduce((sum, d) => sum + durationToTicks(d), 0);
      expect(total).toBe(ticks);
    }
  });
});

describe("constants", () => {
  it("TICKS_PER_QUARTER is 480", () => {
    expect(TICKS_PER_QUARTER).toBe(480);
  });

  it("DURATION_TYPES_ORDERED is longest to shortest", () => {
    expect(DURATION_TYPES_ORDERED).toEqual([
      "whole", "half", "quarter", "eighth", "16th", "32nd", "64th",
    ]);
  });
});
