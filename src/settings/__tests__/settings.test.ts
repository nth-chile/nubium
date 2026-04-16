import { describe, it, expect } from "vitest";
import { defaultSettings } from "../Settings";
import { SHORTCUT_ACTIONS } from "../keybindings";

describe("defaultSettings", () => {
  it("starts with insert mode off by default", () => {
    expect(defaultSettings().startInInsertMode).toBe(false);
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
