import { describe, it, expect } from "vitest";
import {
  partStandardStaveCount,
  partHasSlash,
  partHasTab,
  partStaveCount,
  systemHeight,
  DEFAULT_LAYOUT,
} from "../SystemLayout";
import type { Score } from "../../model/score";
import type { ViewConfig } from "../../views/ViewMode";
import { defaultViewConfig } from "../../views/ViewMode";
import { emptyScore } from "../../model/factory";

function makeScore(instrumentIds: string[] = ["piano"]): Score {
  const score = emptyScore();
  // Replace default part with specified instruments
  score.parts = instrumentIds.map((id) => ({
    ...score.parts[0],
    name: id,
    instrumentId: id,
  }));
  return score;
}

function configWith(partDisplays: Record<number, { standard: boolean; tab: boolean; slash: boolean }>): ViewConfig {
  const config = defaultViewConfig();
  config.notationDisplay = partDisplays;
  return config;
}

describe("partStandardStaveCount", () => {
  it("returns 1 for single-staff instrument with standard on", () => {
    const score = makeScore(["acoustic-guitar"]);
    const vc = configWith({ 0: { standard: true, tab: false, slash: false } });
    expect(partStandardStaveCount(score, 0, vc)).toBe(1);
  });

  it("returns 2 for piano (grand staff) with standard on", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: true, tab: false, slash: false } });
    expect(partStandardStaveCount(score, 0, vc)).toBe(2);
  });

  it("returns 0 when standard is off", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: false, tab: true, slash: false } });
    expect(partStandardStaveCount(score, 0, vc)).toBe(0);
  });

  it("returns 0 when only slash is on (slash is its own stave)", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: false, tab: false, slash: true } });
    expect(partStandardStaveCount(score, 0, vc)).toBe(0);
  });
});

describe("partHasSlash", () => {
  it("returns false by default", () => {
    expect(partHasSlash(0)).toBe(false);
  });

  it("returns true when slash is enabled", () => {
    const vc = configWith({ 0: { standard: true, tab: false, slash: true } });
    expect(partHasSlash(0, vc)).toBe(true);
  });

  it("returns false when slash is disabled", () => {
    const vc = configWith({ 0: { standard: true, tab: true, slash: false } });
    expect(partHasSlash(0, vc)).toBe(false);
  });
});

describe("partHasTab", () => {
  it("returns false by default", () => {
    expect(partHasTab(0)).toBe(false);
  });

  it("returns true when tab is enabled", () => {
    const vc = configWith({ 0: { standard: false, tab: true, slash: false } });
    expect(partHasTab(0, vc)).toBe(true);
  });
});

describe("partStaveCount", () => {
  it("counts standard only", () => {
    const score = makeScore(["acoustic-guitar"]);
    const vc = configWith({ 0: { standard: true, tab: false, slash: false } });
    expect(partStaveCount(score, 0, undefined, vc)).toBe(1);
  });

  it("counts standard + tab", () => {
    const score = makeScore(["acoustic-guitar"]);
    const vc = configWith({ 0: { standard: true, tab: true, slash: false } });
    expect(partStaveCount(score, 0, undefined, vc)).toBe(2);
  });

  it("counts standard + slash + tab", () => {
    const score = makeScore(["acoustic-guitar"]);
    const vc = configWith({ 0: { standard: true, tab: true, slash: true } });
    expect(partStaveCount(score, 0, undefined, vc)).toBe(3);
  });

  it("counts slash-only as 1", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: false, tab: false, slash: true } });
    expect(partStaveCount(score, 0, undefined, vc)).toBe(1);
  });

  it("counts grand staff + slash + tab as 4", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: true, tab: true, slash: true } });
    expect(partStaveCount(score, 0, undefined, vc)).toBe(4);
  });
});

describe("systemHeight", () => {
  it("increases when slash stave is added", () => {
    const score = makeScore(["acoustic-guitar"]);
    const standardOnly = configWith({ 0: { standard: true, tab: false, slash: false } });
    const withSlash = configWith({ 0: { standard: true, tab: false, slash: true } });

    const hStandard = systemHeight(score, DEFAULT_LAYOUT, undefined, standardOnly);
    const hSlash = systemHeight(score, DEFAULT_LAYOUT, undefined, withSlash);

    // Slash adds staffHeight + grandStaffSpacing
    expect(hSlash).toBe(hStandard + DEFAULT_LAYOUT.staffHeight + DEFAULT_LAYOUT.grandStaffSpacing);
  });

  it("slash-only has single staffHeight", () => {
    const score = makeScore(["piano"]);
    const vc = configWith({ 0: { standard: false, tab: false, slash: true } });
    const h = systemHeight(score, DEFAULT_LAYOUT, undefined, vc);
    expect(h).toBe(DEFAULT_LAYOUT.staffHeight);
  });
});
