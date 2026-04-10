import { describe, it, expect } from "vitest";
import {
  defaultViewConfig,
  getPartDisplay,
  getEffectiveInputMode,
  DEFAULT_NOTATION_DISPLAY,
} from "../ViewMode";

describe("defaultViewConfig", () => {
  it("returns standard notation for all parts by default", () => {
    const config = defaultViewConfig();
    expect(config.partsToShow).toBe("all");
    expect(config.notationDisplay).toEqual({});
    expect(config.showAnnotations).toContain("chord-symbol");
    expect(config.showAnnotations).toContain("lyric");
  });
});

describe("getPartDisplay", () => {
  it("returns default (standard only) when no override exists", () => {
    const config = defaultViewConfig();
    const display = getPartDisplay(config, 0);
    expect(display).toEqual({ standard: true, tab: false, slash: false });
  });

  it("returns the configured display for a part", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: true, tab: true, slash: false };
    expect(getPartDisplay(config, 0)).toEqual({ standard: true, tab: true, slash: false });
  });

  it("returns default for unconfigured parts even when others are set", () => {
    const config = defaultViewConfig();
    config.notationDisplay[1] = { standard: false, tab: true, slash: false };
    expect(getPartDisplay(config, 0)).toEqual(DEFAULT_NOTATION_DISPLAY);
    expect(getPartDisplay(config, 1)).toEqual({ standard: false, tab: true, slash: false });
  });

  it("supports all three toggles on simultaneously", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: true, tab: true, slash: true };
    const display = getPartDisplay(config, 0);
    expect(display.standard).toBe(true);
    expect(display.tab).toBe(true);
    expect(display.slash).toBe(true);
  });
});

describe("getEffectiveInputMode", () => {
  it("returns standard for default config", () => {
    const config = defaultViewConfig();
    expect(getEffectiveInputMode(config, 0)).toBe("standard");
  });

  it("returns tab when tab-only", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: false, tab: true, slash: false };
    expect(getEffectiveInputMode(config, 0)).toBe("tab");
  });

  it("returns standard when standard + tab", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: true, tab: true, slash: false };
    expect(getEffectiveInputMode(config, 0)).toBe("standard");
  });

  it("returns standard when slash + tab", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: false, tab: true, slash: true };
    expect(getEffectiveInputMode(config, 0)).toBe("standard");
  });

  it("returns standard when slash-only", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: false, tab: false, slash: true };
    expect(getEffectiveInputMode(config, 0)).toBe("standard");
  });

  it("returns standard when all three on", () => {
    const config = defaultViewConfig();
    config.notationDisplay[0] = { standard: true, tab: true, slash: true };
    expect(getEffectiveInputMode(config, 0)).toBe("standard");
  });
});
