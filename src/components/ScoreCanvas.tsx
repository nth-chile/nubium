import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "../state";
import { initRenderer } from "../renderer";
import { renderScore, calculateContentHeight } from "../renderer";
import { ScoreOverlay } from "./ScoreOverlay";
import { AnnotationPopover } from "./DynamicsPopover";
import { getSettings, subscribeSettings, type DisplaySettings } from "../settings";
import type { AnnotationFilter, ViewConfig } from "../views/ViewMode";

const DISPLAY_TO_FILTER: [keyof DisplaySettings, AnnotationFilter[]][] = [
  ["showLyrics", ["lyric"]],
  ["showChordSymbols", ["chord-symbol"]],
  ["showRehearsalMarks", ["rehearsal-mark"]],
  ["showTempoMarks", ["tempo-mark"]],
  ["showDynamics", ["dynamic", "hairpin"]],
];

function applyDisplaySettings(viewConfig: ViewConfig, display: DisplaySettings): ViewConfig {
  const hidden = DISPLAY_TO_FILTER
    .filter(([key]) => !display[key])
    .flatMap(([, filters]) => filters);
  if (hidden.length === 0) return viewConfig;
  return {
    ...viewConfig,
    showAnnotations: viewConfig.showAnnotations.filter((a) => !hidden.includes(a)),
  };
}

export function ScoreCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [canvasHeight, setCanvasHeight] = useState(600);

  const score = useEditorStore((s) => s.score);
  const inputState = useEditorStore((s) => s.inputState);
  const setNoteBoxes = useEditorStore((s) => s.setNoteBoxes);
  const setAnnotationBoxes = useEditorStore((s) => s.setAnnotationBoxes);
  const setMeasurePositions = useEditorStore((s) => s.setMeasurePositions);
  const playbackTick = useEditorStore((s) => s.playbackTick);
  const viewConfig = useEditorStore((s) => s.viewConfig);
  const selection = useEditorStore((s) => s.selection);
  const noteSelection = useEditorStore((s) => s.noteSelection);
  const editingTitle = useEditorStore((s) => s.editingTitle);
  const editingComposer = useEditorStore((s) => s.editingComposer);
  const hiddenParts = useEditorStore((s) => s.hiddenParts);
  const measurePositions = useEditorStore((s) => s.measurePositions);

  // Track display settings for annotation visibility
  const [displaySettings, setDisplaySettings] = useState(getSettings().display);
  useEffect(() => subscribeSettings((s) => setDisplaySettings(s.display)), []);

  // Auto-scroll to keep editing cursor visible (disabled during playback)
  const isPlaying = useEditorStore((s) => s.isPlaying);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || measurePositions.length === 0 || isPlaying) return;
    const mp = measurePositions.find(
      (p) => p.partIndex === inputState.cursor.partIndex && p.measureIndex === inputState.cursor.measureIndex && p.staveIndex === 0,
    );
    if (!mp) return;

    const rect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;

    // Horizontal: ensure the measure is visible
    if (mp.x < scrollLeft || mp.x + mp.width > scrollLeft + rect.width) {
      container.scrollTo({ left: Math.max(0, mp.x - 40), behavior: "smooth" });
    }
    // Vertical: ensure the staff is visible
    if (mp.y < scrollTop || mp.y + (mp.height || 80) > scrollTop + rect.height) {
      container.scrollTo({ top: Math.max(0, mp.y - 40), behavior: "smooth" });
    }
  }, [inputState.cursor.partIndex, inputState.cursor.measureIndex, measurePositions, isPlaying]);

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setContainerWidth(container.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Resize canvas + render in one pass
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth;
    const effectiveViewConfig = applyDisplaySettings(viewConfig, displaySettings);
    const contentHeight = calculateContentHeight(score, effectiveViewConfig, width);
    const height = Math.max(contentHeight, container.clientHeight);

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = initRenderer(canvas);

    // VexFlow's resize overwrites style dimensions — fix them after init
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    setCanvasHeight(height);

    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.scale) rawCtx.scale(dpr, dpr);

    // Fill canvas with warm off-white background
    const raw = canvas.getContext("2d")!;
    raw.save();
    raw.scale(dpr, dpr);
    raw.fillStyle = "#f0e9de";
    raw.fillRect(0, 0, width, height);
    raw.restore();

    const result = renderScore(ctx, canvas, score, inputState.cursor, playbackTick, effectiveViewConfig, width, noteSelection ? null : selection, inputState.pendingPitch);

    // Draw note-level selection highlights (continuous band, supports cross-measure)
    if (noteSelection && (noteSelection.startMeasure !== noteSelection.endMeasure || noteSelection.startEvent !== noteSelection.endEvent)) {
      rawCtx.save();
      rawCtx.fillStyle = "rgba(59, 130, 246, 0.12)";

      // Group selected notes by system line (same Y = same system)
      const bands = new Map<number, { minX: number; maxX: number; y: number; height: number }>();
      for (let mi = noteSelection.startMeasure; mi <= noteSelection.endMeasure; mi++) {
        const voice = score.parts[noteSelection.partIndex]?.measures[mi]?.voices[noteSelection.voiceIndex];
        if (!voice) continue;
        const mp = result.measurePositions.find(
          (p) => p.partIndex === noteSelection.partIndex && p.measureIndex === mi && p.staveIndex === 0
        );
        if (!mp) continue;
        const startIdx = mi === noteSelection.startMeasure ? noteSelection.startEvent : 0;
        const endIdx = mi === noteSelection.endMeasure ? noteSelection.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          const box = result.noteBoxes.get(voice.events[i].id);
          if (box) {
            const band = bands.get(mp.y) ?? { minX: Infinity, maxX: -Infinity, y: mp.y, height: mp.height };
            band.minX = Math.min(band.minX, box.headX - 3);
            band.maxX = Math.max(band.maxX, box.headX + box.headWidth + 3);
            bands.set(mp.y, band);
          }
        }
      }
      for (const band of bands.values()) {
        if (band.minX < band.maxX) {
          rawCtx.fillRect(band.minX, band.y, band.maxX - band.minX, band.height);
        }
      }
      rawCtx.restore();
    }

    setNoteBoxes(result.noteBoxes);
    setAnnotationBoxes(result.annotationBoxes);
    setMeasurePositions(result.measurePositions);
  }, [score, inputState.cursor, inputState.pendingPitch, playbackTick, viewConfig, containerWidth, selection, noteSelection, editingTitle, editingComposer, hiddenParts, displaySettings, setNoteBoxes, setAnnotationBoxes, setMeasurePositions]);

  return (
    <div
      ref={containerRef}
      data-score-container=""
      style={{ flex: 1, overflow: "auto", background: "#f0e9de", minWidth: 0, position: "relative" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <ScoreOverlay width={containerWidth} height={canvasHeight} />
      <AnnotationPopover />
    </div>
  );
}
