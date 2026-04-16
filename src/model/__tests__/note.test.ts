import { describe, it, expect } from "vitest";
import { isCrossStaff } from "../note";
import { factory } from "../../model";

describe("isCrossStaff", () => {
  it("returns false for normal note without renderStaff", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    expect(isCrossStaff(note, 0)).toBe(false);
  });

  it("returns false when renderStaff matches current staff", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    (note as any).renderStaff = 0;
    expect(isCrossStaff(note, 0)).toBe(false);
  });

  it("returns true when renderStaff differs from current staff", () => {
    const note = factory.note("C", 4, factory.dur("quarter"));
    (note as any).renderStaff = 1;
    expect(isCrossStaff(note, 0)).toBe(true);
  });

  it("returns false for rest (no renderStaff property)", () => {
    const r = factory.rest(factory.dur("quarter"));
    expect(isCrossStaff(r, 0)).toBe(false);
  });

  it("works with chord events", () => {
    const ch = factory.chord([factory.noteHead("C", 4)], factory.dur("quarter"));
    (ch as any).renderStaff = 1;
    expect(isCrossStaff(ch, 0)).toBe(true);
    expect(isCrossStaff(ch, 1)).toBe(false);
  });
});
