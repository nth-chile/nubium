import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { SetRepeatCount } from "../SetRepeatCount";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(partCount: number, measureCount: number, cursorMeasure = 0): EditorSnapshot {
  const parts = Array.from({ length: partCount }, (_, i) => {
    const measures = Array.from({ length: measureCount }, () =>
      factory.measure([factory.voice([factory.note("C", 4, factory.dur("quarter"))])]),
    );
    const p = factory.part(`Part ${i}`, `P${i}`, measures);
    p.measures[measureCount - 1].barlineEnd = "repeat-end";
    return p;
  });
  const input = defaultInputState();
  input.cursor.measureIndex = cursorMeasure;
  return { score: factory.score("Test", "", parts), inputState: input };
}

describe("SetRepeatCount", () => {
  it("sets repeatTimes on the cursor measure across all parts", () => {
    const snap = makeSnapshot(3, 2, 1);
    const result = new SetRepeatCount(4).execute(snap);
    for (const part of result.score.parts) {
      expect(part.measures[1].repeatTimes).toBe(4);
    }
  });

  it("clears repeatTimes when set to 2 (default)", () => {
    const snap = makeSnapshot(2, 2, 1);
    for (const part of snap.score.parts) part.measures[1].repeatTimes = 5;
    const result = new SetRepeatCount(2).execute(snap);
    for (const part of result.score.parts) {
      expect(part.measures[1].repeatTimes).toBeUndefined();
    }
  });

  it("clears repeatTimes when given undefined", () => {
    const snap = makeSnapshot(1, 2, 1);
    snap.score.parts[0].measures[1].repeatTimes = 3;
    const result = new SetRepeatCount(undefined).execute(snap);
    expect(result.score.parts[0].measures[1].repeatTimes).toBeUndefined();
  });

  it("clamps absurdly large counts", () => {
    const snap = makeSnapshot(1, 2, 1);
    const result = new SetRepeatCount(10000).execute(snap);
    expect(result.score.parts[0].measures[1].repeatTimes).toBe(99);
  });

  it("floors fractional counts", () => {
    const snap = makeSnapshot(1, 2, 1);
    const result = new SetRepeatCount(3.9).execute(snap);
    expect(result.score.parts[0].measures[1].repeatTimes).toBe(3);
  });

  it("does not modify the original snapshot", () => {
    const snap = makeSnapshot(1, 2, 1);
    new SetRepeatCount(5).execute(snap);
    expect(snap.score.parts[0].measures[1].repeatTimes).toBeUndefined();
  });
});
