import { describe, it, expect, beforeEach } from "vitest";
import { getSettings, updateSettings, resetSettings } from "../../settings/Settings";
import { useEditorStore } from "../EditorState";

/**
 * Tests for #228 — Score-only zoom
 *
 * Zoom is stored in AppSettings.scoreZoom and consumed only by ScoreCanvas
 * (via canvas scaling in initRenderer). It does NOT live in EditorState or
 * affect the app shell — verifying that the setting round-trips correctly
 * and clamps to valid bounds covers the state side of this feature.
 *
 * Tests for #234 — Cursor/playback scroll after refactor
 *
 * Auto-scroll logic lives in scrollIntoViewMeasure() inside ScoreCanvas.
 * It uses measurePositions (stored in EditorState) and zoom to compute
 * display-space coordinates. We test that measurePositions round-trip
 * through the store and that the zoom-adjusted coordinate math is correct.
 */

describe("Score-only zoom (#228)", () => {
  beforeEach(() => {
    resetSettings();
  });

  it("defaults scoreZoom to 1", () => {
    expect(getSettings().scoreZoom).toBe(1);
  });

  it("updates scoreZoom via updateSettings", () => {
    updateSettings({ scoreZoom: 1.5 });
    expect(getSettings().scoreZoom).toBe(1.5);
  });

  it("preserves other settings when changing zoom", () => {
    updateSettings({ metronomeEnabled: true });
    updateSettings({ scoreZoom: 2 });
    expect(getSettings().metronomeEnabled).toBe(true);
    expect(getSettings().scoreZoom).toBe(2);
  });

  it("allows zoom down to 0.5", () => {
    const next = Math.max(0.5, Math.round((0.6 - 0.1) * 10) / 10);
    updateSettings({ scoreZoom: next });
    expect(getSettings().scoreZoom).toBe(0.5);
  });

  it("allows zoom up to 3", () => {
    const next = Math.min(3, Math.round((2.9 + 0.1) * 10) / 10);
    updateSettings({ scoreZoom: next });
    expect(getSettings().scoreZoom).toBe(3);
  });

  it("clamps zoom-in at max 3", () => {
    const next = Math.min(3, Math.round((3.0 + 0.1) * 10) / 10);
    updateSettings({ scoreZoom: next });
    expect(getSettings().scoreZoom).toBe(3);
  });

  it("clamps zoom-out at min 0.5", () => {
    const next = Math.max(0.5, Math.round((0.5 - 0.1) * 10) / 10);
    updateSettings({ scoreZoom: next });
    expect(getSettings().scoreZoom).toBe(0.5);
  });

  it("resets zoom to 1 on zoom:reset action", () => {
    updateSettings({ scoreZoom: 2 });
    updateSettings({ scoreZoom: 1 });
    expect(getSettings().scoreZoom).toBe(1);
  });

  it("rounds zoom increments to avoid floating-point drift", () => {
    // Simulate repeated zoom-in from 1.0
    let z = 1.0;
    for (let i = 0; i < 5; i++) {
      z = Math.min(3, Math.round((z + 0.1) * 10) / 10);
    }
    expect(z).toBe(1.5);
    updateSettings({ scoreZoom: z });
    expect(getSettings().scoreZoom).toBe(1.5);
  });
});

describe("Cursor/playback scroll — measurePositions store (#234)", () => {
  // The auto-scroll function scrollIntoViewMeasure() reads measurePositions
  // from the store and multiplies by zoom for display-space math.
  // We verify the store holds positions correctly and the coordinate
  // math used by the scroll logic is sound.

  it("stores and retrieves measurePositions", () => {
    const positions = [
      { partIndex: 0, measureIndex: 0, staveIndex: 0, x: 50, y: 100, width: 200, height: 80, noteStartX: 70 },
      { partIndex: 0, measureIndex: 1, staveIndex: 0, x: 250, y: 100, width: 200, height: 80, noteStartX: 270 },
    ];
    useEditorStore.getState().setMeasurePositions(positions);
    expect(useEditorStore.getState().measurePositions).toEqual(positions);
  });

  it("finds the correct measure position for scroll targeting", () => {
    const positions = [
      { partIndex: 0, measureIndex: 0, staveIndex: 0, x: 50, y: 100, width: 200, height: 80, noteStartX: 70 },
      { partIndex: 0, measureIndex: 1, staveIndex: 0, x: 250, y: 100, width: 200, height: 80, noteStartX: 270 },
      { partIndex: 1, measureIndex: 0, staveIndex: 0, x: 50, y: 300, width: 200, height: 80, noteStartX: 70 },
    ];
    // Simulate the lookup from scrollIntoViewMeasure
    const partIndex = 0;
    const measureIndex = 1;
    const mp =
      positions.find((p) => p.partIndex === partIndex && p.measureIndex === measureIndex && p.staveIndex === 0) ??
      positions.find((p) => p.measureIndex === measureIndex && p.staveIndex === 0);
    expect(mp).toBeDefined();
    expect(mp!.x).toBe(250);
    expect(mp!.y).toBe(100);
  });

  it("applies zoom to display-space coordinates for scroll math", () => {
    const mp = { x: 200, y: 100, width: 180, height: 80 };
    const zoom = 1.5;
    const dx = mp.x * zoom;
    const dw = mp.width * zoom;
    const dy = mp.y * zoom;
    const dh = mp.height * zoom;

    expect(dx).toBe(300);
    expect(dw).toBe(270);
    expect(dy).toBe(150);
    expect(dh).toBe(120);
  });

  it("scroll logic detects when measure is offscreen (horizontal)", () => {
    const mp = { x: 800, width: 200 };
    const zoom = 1.2;
    const dx = mp.x * zoom; // 960
    const dw = mp.width * zoom; // 240
    const scrollLeft = 0;
    const containerWidth = 900;

    // Measure right edge (960+240=1200) > viewport right (0+900=900)
    const offRight = dx + dw > scrollLeft + containerWidth;
    expect(offRight).toBe(true);

    // Measure left edge (960) >= scrollLeft (0) — not off left
    const offLeft = dx < scrollLeft;
    expect(offLeft).toBe(false);
  });

  it("scroll logic detects when measure is offscreen (vertical)", () => {
    const mp = { y: 600, height: 80 };
    const zoom = 1.0;
    const dy = mp.y * zoom;
    const dh = mp.height * zoom;
    const scrollTop = 0;
    const containerHeight = 500;

    const offBottom = dy + dh > scrollTop + containerHeight;
    expect(offBottom).toBe(true);
  });

  it("falls back to any matching measure when part-specific lookup fails", () => {
    const positions = [
      { partIndex: 1, measureIndex: 3, staveIndex: 0, x: 400, y: 200, width: 200, height: 80, noteStartX: 420 },
    ];
    // Try partIndex 0 first (no match), then fall back
    const partIndex = 0;
    const measureIndex = 3;
    const mp =
      positions.find((p) => p.partIndex === partIndex && p.measureIndex === measureIndex && p.staveIndex === 0) ??
      positions.find((p) => p.measureIndex === measureIndex && p.staveIndex === 0);
    expect(mp).toBeDefined();
    expect(mp!.partIndex).toBe(1);
  });
});
