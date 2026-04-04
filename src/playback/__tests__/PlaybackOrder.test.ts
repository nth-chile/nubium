import { describe, it, expect } from "vitest";
import { computePlaybackOrder } from "../PlaybackOrder";
import { factory } from "../../model";
import type { Measure, Score } from "../../model";
import type { NavigationMarks } from "../../model/navigation";
import type { BarlineType } from "../../model/time";

function makeMeasure(
  barlineEnd: BarlineType = "single",
  navigation?: NavigationMarks
): Measure {
  const m = factory.measure([factory.voice([])]);
  m.barlineEnd = barlineEnd;
  if (navigation) m.navigation = navigation;
  return m;
}

function makeScore(measures: Measure[]): Score {
  return factory.score("Test", "", [factory.part("P1", "P1", measures)]);
}

describe("computePlaybackOrder", () => {
  it("returns linear order for no repeats", () => {
    const s = makeScore([makeMeasure(), makeMeasure(), makeMeasure()]);
    expect(computePlaybackOrder(s, 0)).toEqual([0, 1, 2]);
  });

  it("handles simple repeat (repeat-end)", () => {
    // m0: normal, m1: repeat-end
    // Expected: 0, 1, 0, 1
    const s = makeScore([makeMeasure(), makeMeasure("repeat-end")]);
    expect(computePlaybackOrder(s, 0)).toEqual([0, 1, 0, 1]);
  });

  it("handles repeat-start and repeat-end", () => {
    // m0: normal, m1: repeat-start, m2: repeat-end, m3: normal
    // The repeat-start on m1 means the repeat section starts AT m1.
    // On repeat-end at m2, jump back to m1.
    // Expected: 0, 1, 2, 1, 2, 3
    const s = makeScore([
      makeMeasure(),
      makeMeasure("repeat-start"),
      makeMeasure("repeat-end"),
      makeMeasure(),
    ]);
    expect(computePlaybackOrder(s, 0)).toEqual([0, 1, 2, 1, 2, 3]);
  });

  it("handles volta brackets", () => {
    // m0: normal, m1: volta [1] + repeat-end, m2: volta [2], m3: normal
    const s = makeScore([
      makeMeasure(),
      makeMeasure("repeat-end", { volta: { endings: [1] } }),
      makeMeasure("single", { volta: { endings: [2] } }),
      makeMeasure(),
    ]);
    // First pass: 0, 1 (volta 1, hits repeat-end, jump to 0)
    // Second pass: 0, skip 1 (volta 1 doesn't match pass 2), 2 (volta 2), 3
    const order = computePlaybackOrder(s, 0);
    expect(order).toEqual([0, 1, 0, 2, 3]);
  });

  it("handles D.S. al Coda", () => {
    // m0: segno, m1: toCoda, m2: ds "al Coda", m3: coda
    const s = makeScore([
      makeMeasure("single", { segno: true }),
      makeMeasure("single", { toCoda: true }),
      makeMeasure("single", { dsText: "D.S. al Coda" }),
      makeMeasure("single", { coda: true }),
    ]);
    // Linear: 0, 1, 2 (D.S. -> jump to segno at 0)
    // From segno: 0, 1 (To Coda -> jump to coda at 3), 3
    const order = computePlaybackOrder(s, 0);
    expect(order).toEqual([0, 1, 2, 0, 1, 3]);
  });

  it("handles D.C. al Fine", () => {
    // m0: normal, m1: fine, m2: dc "al Fine"
    const s = makeScore([
      makeMeasure(),
      makeMeasure("single", { fine: true }),
      makeMeasure("single", { dcText: "D.C. al Fine" }),
    ]);
    // Linear: 0, 1, 2 (D.C. -> jump to 0)
    // From top: 0, 1 (Fine -> stop)
    const order = computePlaybackOrder(s, 0);
    expect(order).toEqual([0, 1, 2, 0, 1]);
  });

  it("returns empty for empty part", () => {
    const s = makeScore([]);
    expect(computePlaybackOrder(s, 0)).toEqual([]);
  });

  it("returns empty for invalid part index", () => {
    const s = makeScore([makeMeasure()]);
    expect(computePlaybackOrder(s, 5)).toEqual([]);
  });
});
