import { describe, it, expect } from "vitest";
import { MEASURE_NUMBER_FONT } from "../ScoreRenderer";

describe("measure number font size (#259)", () => {
  it("uses 11px for readability (bumped from 10px)", () => {
    expect(MEASURE_NUMBER_FONT).toBe("11px sans-serif");
  });

  it("parses as a valid CSS font shorthand with a pixel size", () => {
    const match = MEASURE_NUMBER_FONT.match(/^(\d+)px\s+\S+/);
    expect(match).not.toBeNull();
    const px = Number(match![1]);
    expect(px).toBeGreaterThanOrEqual(11);
  });
});
