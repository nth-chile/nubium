import { describe, it, expect } from "vitest";
import { factory } from "../../model";
import { SetNavigationMark } from "../SetNavigationMark";
import { SetVolta } from "../SetVolta";
import { SetRepeatBarline } from "../SetRepeatBarline";
import type { EditorSnapshot } from "../Command";
import { defaultInputState } from "../../input/InputState";

function makeSnapshot(overrides?: {
  parts?: ReturnType<typeof factory.part>[];
  cursor?: Partial<ReturnType<typeof defaultInputState>["cursor"]>;
}): EditorSnapshot {
  const parts = overrides?.parts ?? [
    factory.part("Piano", "Pno.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ]),
    factory.part("Violin", "Vln.", [
      factory.measure([factory.voice([])]),
      factory.measure([factory.voice([])]),
    ]),
  ];
  const input = defaultInputState();
  if (overrides?.cursor) {
    Object.assign(input.cursor, overrides.cursor);
  }
  return {
    score: factory.score("Test", "", parts),
    inputState: input,
  };
}

describe("SetNavigationMark", () => {
  it("sets coda on all parts", () => {
    const snap = makeSnapshot();
    const cmd = new SetNavigationMark("coda");
    const result = cmd.execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.coda).toBe(true);
    }
  });

  it("sets segno on all parts", () => {
    const snap = makeSnapshot();
    const cmd = new SetNavigationMark("segno");
    const result = cmd.execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.segno).toBe(true);
    }
  });

  it("sets toCoda on all parts", () => {
    const snap = makeSnapshot();
    const result = new SetNavigationMark("toCoda").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.toCoda).toBe(true);
    }
  });

  it("sets fine on all parts", () => {
    const snap = makeSnapshot();
    const result = new SetNavigationMark("fine").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.fine).toBe(true);
    }
  });

  it("sets D.S. with default text", () => {
    const snap = makeSnapshot();
    const result = new SetNavigationMark("ds").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.dsText).toBe("D.S. al Coda");
    }
  });

  it("sets D.S. with custom text", () => {
    const snap = makeSnapshot();
    const result = new SetNavigationMark("ds", "D.S. al Fine").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.dsText).toBe("D.S. al Fine");
    }
  });

  it("sets D.C. with default text", () => {
    const snap = makeSnapshot();
    const result = new SetNavigationMark("dc").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.dcText).toBe("D.C. al Fine");
    }
  });

  it("toggles coda off when already set", () => {
    const snap = makeSnapshot();
    const r1 = new SetNavigationMark("coda").execute(snap);
    const r2 = new SetNavigationMark("coda").execute(r1);

    for (const part of r2.score.parts) {
      // Navigation should be cleaned up entirely
      expect(part.measures[0].navigation).toBeUndefined();
    }
  });

  it("toggles D.S. off when already set", () => {
    const snap = makeSnapshot();
    const r1 = new SetNavigationMark("ds").execute(snap);
    const r2 = new SetNavigationMark("ds").execute(r1);

    for (const part of r2.score.parts) {
      expect(part.measures[0].navigation).toBeUndefined();
    }
  });

  it("cleans up empty navigation object", () => {
    const snap = makeSnapshot();
    const r1 = new SetNavigationMark("coda").execute(snap);
    expect(r1.score.parts[0].measures[0].navigation).toBeDefined();

    const r2 = new SetNavigationMark("coda").execute(r1);
    expect(r2.score.parts[0].measures[0].navigation).toBeUndefined();
  });

  it("applies to correct measure index", () => {
    const snap = makeSnapshot({ cursor: { measureIndex: 1 } });
    const result = new SetNavigationMark("segno").execute(snap);

    // Measure 0 should be unchanged
    expect(result.score.parts[0].measures[0].navigation).toBeUndefined();
    // Measure 1 should have segno
    expect(result.score.parts[0].measures[1].navigation?.segno).toBe(true);
  });
});

describe("SetVolta", () => {
  it("sets volta on all parts", () => {
    const snap = makeSnapshot();
    const cmd = new SetVolta({ endings: [1] });
    const result = cmd.execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.volta).toEqual({ endings: [1] });
    }
  });

  it("sets volta with multiple endings", () => {
    const snap = makeSnapshot();
    const result = new SetVolta({ endings: [1, 2] }).execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].navigation?.volta?.endings).toEqual([1, 2]);
    }
  });

  it("removes volta when set to null", () => {
    const snap = makeSnapshot();
    const r1 = new SetVolta({ endings: [1] }).execute(snap);
    const r2 = new SetVolta(null).execute(r1);

    for (const part of r2.score.parts) {
      expect(part.measures[0].navigation).toBeUndefined();
    }
  });

  it("preserves other navigation marks when removing volta", () => {
    const snap = makeSnapshot();
    const r1 = new SetNavigationMark("segno").execute(snap);
    const r2 = new SetVolta({ endings: [1] }).execute(r1);
    const r3 = new SetVolta(null).execute(r2);

    for (const part of r3.score.parts) {
      expect(part.measures[0].navigation?.segno).toBe(true);
      expect(part.measures[0].navigation?.volta).toBeUndefined();
    }
  });
});

describe("SetRepeatBarline", () => {
  it("sets repeat-end barline on all parts", () => {
    const snap = makeSnapshot();
    const cmd = new SetRepeatBarline("repeat-end");
    const result = cmd.execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("repeat-end");
    }
  });

  it("toggles barline back to single when already set", () => {
    const snap = makeSnapshot();
    const r1 = new SetRepeatBarline("repeat-end").execute(snap);
    const r2 = new SetRepeatBarline("repeat-end").execute(r1);

    for (const part of r2.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("single");
    }
  });

  it("sets double barline", () => {
    const snap = makeSnapshot();
    const result = new SetRepeatBarline("double").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("double");
    }
  });

  it("sets final barline", () => {
    const snap = makeSnapshot();
    const result = new SetRepeatBarline("final").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("final");
    }
  });

  it("sets repeat-both barline", () => {
    const snap = makeSnapshot();
    const result = new SetRepeatBarline("repeat-both").execute(snap);

    for (const part of result.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("repeat-both");
    }
  });

  it("changes from one barline type to another", () => {
    const snap = makeSnapshot();
    const r1 = new SetRepeatBarline("double").execute(snap);
    const r2 = new SetRepeatBarline("final").execute(r1);

    for (const part of r2.score.parts) {
      expect(part.measures[0].barlineEnd).toBe("final");
    }
  });
});
