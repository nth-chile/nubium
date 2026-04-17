import { describe, it, expect } from "vitest";

/**
 * Tests for #262 — digit keys on a tab stave must only be intercepted as
 * fret entry when note entry is on. With note entry off, digits should
 * fall through to the normal-mode "duration:whole/half/quarter/..." shortcuts.
 *
 * Mirrors the gate in KeyboardShortcuts.tsx:
 *   if (state.inputState.noteEntry && e.key >= "0" && e.key <= "9" && !modifiers)
 */
function shouldInterceptDigitAsFret(opts: {
  cursorOnTab: boolean;
  noteEntry: boolean;
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}): boolean {
  const { cursorOnTab, noteEntry, key, ctrl, meta, alt } = opts;
  if (!cursorOnTab) return false;
  if (!noteEntry) return false;
  if (!(key >= "0" && key <= "9")) return false;
  if (ctrl || meta || alt) return false;
  return true;
}

describe("tab digit interception gate (#262)", () => {
  it("intercepts digits when on tab stave AND note entry is on", () => {
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: "5" })).toBe(true);
  });

  it("does NOT intercept digits when on tab stave but note entry is OFF", () => {
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: false, key: "5" })).toBe(false);
  });

  it("does NOT intercept digits when not on a tab stave", () => {
    expect(shouldInterceptDigitAsFret({ cursorOnTab: false, noteEntry: true, key: "5" })).toBe(false);
  });

  it("does NOT intercept digits with ctrl/meta/alt modifiers", () => {
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: "5", ctrl: true })).toBe(false);
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: "5", meta: true })).toBe(false);
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: "5", alt: true })).toBe(false);
  });

  it("covers full digit range 0-9 when note entry is on", () => {
    for (let d = 0; d <= 9; d++) {
      expect(
        shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: String(d) })
      ).toBe(true);
    }
  });

  it("does not intercept letters", () => {
    expect(shouldInterceptDigitAsFret({ cursorOnTab: true, noteEntry: true, key: "a" })).toBe(false);
  });
});
