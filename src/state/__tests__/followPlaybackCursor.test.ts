import { describe, it, expect } from "vitest";
import { getSettings, updateSettings, resetSettings } from "../../settings/Settings";

/**
 * Tests for #215 — Follow playback cursor setting.
 *
 * The `followPlaybackCursor` setting controls whether the score auto-scrolls
 * during playback. The actual scrolling is DOM-level (in ScoreCanvas.tsx via
 * a useEffect that checks `followPlayback`), so we can't unit-test the scroll
 * behavior itself. But we can test that:
 * 1. The setting defaults to true
 * 2. It persists through updateSettings
 * 3. It can be toggled off/on
 */

describe("followPlaybackCursor setting (#215)", () => {
  it("defaults to true", () => {
    resetSettings();
    const settings = getSettings();
    expect(settings.followPlaybackCursor).toBe(true);
  });

  it("can be set to false", () => {
    resetSettings();
    updateSettings({ followPlaybackCursor: false });
    expect(getSettings().followPlaybackCursor).toBe(false);
  });

  it("can be toggled back to true", () => {
    resetSettings();
    updateSettings({ followPlaybackCursor: false });
    updateSettings({ followPlaybackCursor: true });
    expect(getSettings().followPlaybackCursor).toBe(true);
  });

  it("survives a round-trip through updateSettings without affecting other fields", () => {
    resetSettings();
    const before = getSettings();
    const originalMetronome = before.metronomeEnabled;

    updateSettings({ followPlaybackCursor: false });
    const after = getSettings();

    expect(after.followPlaybackCursor).toBe(false);
    expect(after.metronomeEnabled).toBe(originalMetronome);
  });
});
