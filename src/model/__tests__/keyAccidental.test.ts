import { describe, it, expect } from "vitest";
import { keyAccidental } from "../pitch";

describe("keyAccidental", () => {
  it("returns natural for all notes in C major (0 fifths)", () => {
    const notes = ["C", "D", "E", "F", "G", "A", "B"] as const;
    for (const n of notes) {
      expect(keyAccidental(n, 0)).toBe("natural");
    }
  });

  it("returns sharp for F in G major (1 sharp)", () => {
    expect(keyAccidental("F", 1)).toBe("sharp");
    expect(keyAccidental("C", 1)).toBe("natural");
  });

  it("returns sharp for F and C in D major (2 sharps)", () => {
    expect(keyAccidental("F", 2)).toBe("sharp");
    expect(keyAccidental("C", 2)).toBe("sharp");
    expect(keyAccidental("G", 2)).toBe("natural");
  });

  it("returns flat for B in F major (-1 flat)", () => {
    expect(keyAccidental("B", -1)).toBe("flat");
    expect(keyAccidental("E", -1)).toBe("natural");
  });

  it("returns flat for B and E in Bb major (-2 flats)", () => {
    expect(keyAccidental("B", -2)).toBe("flat");
    expect(keyAccidental("E", -2)).toBe("flat");
    expect(keyAccidental("A", -2)).toBe("natural");
  });

  it("returns all sharps for 7 sharps", () => {
    expect(keyAccidental("F", 7)).toBe("sharp");
    expect(keyAccidental("C", 7)).toBe("sharp");
    expect(keyAccidental("G", 7)).toBe("sharp");
    expect(keyAccidental("D", 7)).toBe("sharp");
    expect(keyAccidental("A", 7)).toBe("sharp");
    expect(keyAccidental("E", 7)).toBe("sharp");
    expect(keyAccidental("B", 7)).toBe("sharp");
  });

  it("returns all flats for -7 flats", () => {
    expect(keyAccidental("B", -7)).toBe("flat");
    expect(keyAccidental("E", -7)).toBe("flat");
    expect(keyAccidental("A", -7)).toBe("flat");
    expect(keyAccidental("D", -7)).toBe("flat");
    expect(keyAccidental("G", -7)).toBe("flat");
    expect(keyAccidental("C", -7)).toBe("flat");
    expect(keyAccidental("F", -7)).toBe("flat");
  });
});
