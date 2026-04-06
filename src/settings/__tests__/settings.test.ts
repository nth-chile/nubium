import { describe, it, expect, beforeEach, vi } from "vitest";
import { defaultSettings } from "../Settings";
import { defaultKeyBindings, SHORTCUT_ACTIONS } from "../keybindings";

describe("defaultSettings", () => {
  it("returns expected default tempo", () => {
    expect(defaultSettings().defaultTempo).toBe(120);
  });

  it("returns 4/4 time signature", () => {
    const ts = defaultSettings().defaultTimeSignature;
    expect(ts.numerator).toBe(4);
    expect(ts.denominator).toBe(4);
  });

  it("returns treble clef", () => {
    expect(defaultSettings().defaultClef).toBe("treble");
  });

  it("has autoBeam enabled", () => {
    expect(defaultSettings().autoBeam).toBe(true);
  });

  it("has metronome disabled by default", () => {
    expect(defaultSettings().metronomeEnabled).toBe(false);
  });

  it("has 50 max history snapshots", () => {
    expect(defaultSettings().historyMaxSnapshots).toBe(50);
  });

  it("includes keybindings for all shortcut actions", () => {
    const bindings = defaultSettings().keyBindings;
    for (const action of SHORTCUT_ACTIONS) {
      expect(bindings[action.id]).toBeDefined();
    }
  });

  it("returns a fresh object each call", () => {
    const a = defaultSettings();
    const b = defaultSettings();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
