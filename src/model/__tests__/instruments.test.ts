import { describe, it, expect } from "vitest";
import { INSTRUMENTS, getInstrument } from "../instruments";

describe("INSTRUMENTS", () => {
  it("contains at least 10 instruments", () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids", () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique names", () => {
    const names = INSTRUMENTS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every instrument has required fields", () => {
    for (const inst of INSTRUMENTS) {
      expect(inst.id).toBeTruthy();
      expect(inst.name).toBeTruthy();
      expect(inst.abbreviation).toBeTruthy();
      expect(inst.clef).toBeTruthy();
      expect(typeof inst.midiProgram).toBe("number");
      expect(typeof inst.transposition).toBe("number");
      expect(inst.staves).toBeGreaterThanOrEqual(1);
    }
  });

  it("piano has 2 staves", () => {
    const piano = INSTRUMENTS.find((i) => i.id === "piano");
    expect(piano).toBeDefined();
    expect(piano!.staves).toBe(2);
  });

  it("transposing instruments have non-zero transposition", () => {
    const clarinet = INSTRUMENTS.find((i) => i.id === "clarinet");
    expect(clarinet).toBeDefined();
    expect(clarinet!.transposition).toBe(-2);

    const altoSax = INSTRUMENTS.find((i) => i.id === "alto-sax");
    expect(altoSax).toBeDefined();
    expect(altoSax!.transposition).toBe(-9);
  });

  it("concert pitch instruments have zero transposition", () => {
    for (const id of ["piano", "guitar", "violin", "flute"]) {
      const inst = INSTRUMENTS.find((i) => i.id === id);
      expect(inst?.transposition).toBe(0);
    }
  });

  it("pitch ranges are valid where defined", () => {
    for (const inst of INSTRUMENTS) {
      if (inst.minPitch !== undefined && inst.maxPitch !== undefined) {
        expect(inst.maxPitch).toBeGreaterThan(inst.minPitch);
        // MIDI range sanity
        expect(inst.minPitch).toBeGreaterThanOrEqual(0);
        expect(inst.maxPitch).toBeLessThanOrEqual(127);
      }
    }
  });
});

describe("getInstrument", () => {
  it("returns the correct instrument by id", () => {
    const piano = getInstrument("piano");
    expect(piano).toBeDefined();
    expect(piano!.name).toBe("Piano");
  });

  it("returns undefined for unknown id", () => {
    expect(getInstrument("theremin")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getInstrument("")).toBeUndefined();
  });

  it("finds every instrument in the INSTRUMENTS array", () => {
    for (const inst of INSTRUMENTS) {
      const found = getInstrument(inst.id);
      expect(found).toBe(inst);
    }
  });
});
