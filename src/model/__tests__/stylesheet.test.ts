import { describe, it, expect } from "vitest";
import { defaultStylesheet, resolveStylesheet } from "../stylesheet";

describe("defaultStylesheet", () => {
  it("returns all expected properties", () => {
    const ss = defaultStylesheet();
    expect(ss.staffSize).toBe(8);
    expect(ss.spacingFactor).toBe(1.0);
    expect(ss.chordSymbolSize).toBe(14);
    expect(ss.lyricSize).toBe(16);
    expect(ss.measureMinWidth).toBe(150);
    expect(ss.measureMaxWidth).toBe(700);
    expect(ss.systemMarginLeft).toBe(20);
    expect(ss.systemMarginRight).toBe(20);
    expect(ss.staffSpacing).toBe(80);
    expect(ss.fontFamily).toBe("serif");
  });

  it("returns a new object each call", () => {
    const a = defaultStylesheet();
    const b = defaultStylesheet();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("resolveStylesheet", () => {
  it("returns defaults when no overrides given", () => {
    const ss = resolveStylesheet();
    expect(ss).toEqual(defaultStylesheet());
  });

  it("returns defaults when empty object given", () => {
    const ss = resolveStylesheet({});
    expect(ss).toEqual(defaultStylesheet());
  });

  it("overrides specific properties while keeping defaults", () => {
    const ss = resolveStylesheet({ staffSize: 12, fontFamily: "sans-serif" });
    expect(ss.staffSize).toBe(12);
    expect(ss.fontFamily).toBe("sans-serif");
    expect(ss.spacingFactor).toBe(1.0);
    expect(ss.measureMinWidth).toBe(150);
  });
});
