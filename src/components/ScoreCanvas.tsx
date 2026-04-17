import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "../state";
import { initRenderer } from "../renderer";
import { renderScore, calculateContentHeight } from "../renderer";
import { ScoreOverlay } from "./ScoreOverlay";
import { AnnotationPopover } from "./DynamicsPopover";
import { getSettings, subscribeSettings, type DisplaySettings } from "../settings";
import { getMeasureIndexForTick } from "../playback/TonePlayback";
import type { AnnotationFilter, ViewConfig } from "../views/ViewMode";
import { CANVAS_BACKGROUND, NOTE_SELECTION_BAND } from "../renderer/colors";

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
  const setBreakBoxes = useEditorStore((s) => s.setBreakBoxes);
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
  const [followPlayback, setFollowPlayback] = useState(getSettings().followPlaybackCursor);
  const [zoom, setZoom] = useState(getSettings().scoreZoom);
  useEffect(() => subscribeSettings((s) => {
    setDisplaySettings(s.display);
    setFollowPlayback(s.followPlaybackCursor);
    setZoom(s.scoreZoom);
  }), []);

  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectionStart = selection?.measureStart ?? null;
  const selectionEnd = selection?.measureEnd ?? null;

  // Track playbackTick in a ref so the heavy render effect can read it without
  // being triggered by every tick update.  A separate lightweight effect handles
  // playback-only redraws (cursor line + active-note highlights) without
  // rebuilding hit-box / measure-position maps that never change during playback.
  const playbackTickRef = useRef(playbackTick);
  playbackTickRef.current = playbackTick;

  // Monotonic counter bumped by the layout effect — the playback effect reads it
  // to know when the last full layout render happened so it can skip redundant redraws.
  const layoutGenRef = useRef(0);
  const playbackGenRef = useRef(-1);

  // Latest-value refs so scroll effects can read state without listing it as a dep
  // (a scroll should fire only when the thing it tracks changes — not on re-renders)
  const measurePositionsRef = useRef(measurePositions);
  measurePositionsRef.current = measurePositions;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const partIndexRef = useRef(inputState.cursor.partIndex);
  partIndexRef.current = inputState.cursor.partIndex;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  function scrollIntoViewMeasure(partIndex: number, measureIndex: number) {
    const container = containerRef.current;
    if (!container) return;
    const positions = measurePositionsRef.current;
    if (positions.length === 0) return;
    const mp =
      positions.find((p) => p.partIndex === partIndex && p.measureIndex === measureIndex && p.staveIndex === 0) ??
      positions.find((p) => p.measureIndex === measureIndex && p.staveIndex === 0);
    if (!mp) return;
    const z = zoomRef.current;
    const rect = container.getBoundingClientRect();
    const dx = mp.x * z, dw = mp.width * z, dy = mp.y * z, dh = (mp.height || 80) * z;
    if (dx < container.scrollLeft || dx + dw > container.scrollLeft + rect.width) {
      container.scrollTo({ left: Math.max(0, dx - 40), behavior: "smooth" });
    }
    if (dy < container.scrollTop || dy + dh > container.scrollTop + rect.height) {
      container.scrollTo({ top: Math.max(0, dy - 40), behavior: "smooth" });
    }
  }

  // Editing cursor scroll: only fires when the edit cursor or selection edges
  // actually move. Skipped during playback so the playback scroller owns the view.
  // Not dep'd on isPlaying / measurePositions / zoom — those would cause spurious
  // scrolls when toggling playback or re-rendering.
  const prevEditRef = useRef<{ part: number; measure: number; selStart: number | null; selEnd: number | null } | null>(null);
  useEffect(() => {
    if (isPlayingRef.current) {
      prevEditRef.current = null;
      return;
    }
    const cur = {
      part: inputState.cursor.partIndex,
      measure: inputState.cursor.measureIndex,
      selStart: selectionStart,
      selEnd: selectionEnd,
    };
    const prev = prevEditRef.current;
    prevEditRef.current = cur;
    if (!prev) return;

    let targetMeasure: number | null = null;
    if (cur.selStart != null && cur.selEnd != null) {
      if (cur.selEnd !== prev.selEnd) targetMeasure = cur.selEnd;
      else if (cur.selStart !== prev.selStart) targetMeasure = cur.selStart;
    } else if (cur.measure !== prev.measure || cur.part !== prev.part) {
      targetMeasure = cur.measure;
    }
    if (targetMeasure == null) return;
    scrollIntoViewMeasure(cur.part, targetMeasure);
  }, [inputState.cursor.partIndex, inputState.cursor.measureIndex, selectionStart, selectionEnd]);

  // Playback cursor scroll: fires when the currently-playing measure changes
  // (derived from playbackTick via measureBoundaries, which tracks repeats).
  // Clears state on stop/pause so nothing scrolls while not playing.
  const prevPlaybackMeasureRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying || !followPlayback) {
      prevPlaybackMeasureRef.current = null;
      return;
    }
    if (playbackTick == null || playbackTick < 0) return;
    const { measureIndex } = getMeasureIndexForTick(playbackTick);
    if (prevPlaybackMeasureRef.current === measureIndex) return;
    prevPlaybackMeasureRef.current = measureIndex;
    scrollIntoViewMeasure(partIndexRef.current, measureIndex);
  }, [playbackTick, isPlaying, followPlayback]);

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

  // Helper: build selectedNoteIds / selectedHeadByEventId from current noteSelection.
  function buildNoteSelectionSets() {
    let selectedNoteIds: Set<import("../model/ids").NoteEventId> | undefined;
    let selectedHeadByEventId: Map<import("../model/ids").NoteEventId, number> | undefined;
    if (noteSelection) {
      selectedNoteIds = new Set();
      for (let mi = noteSelection.startMeasure; mi <= noteSelection.endMeasure; mi++) {
        const voice = score.parts[noteSelection.partIndex]?.measures[mi]?.voices[noteSelection.voiceIndex];
        if (!voice) continue;
        const startIdx = mi === noteSelection.startMeasure ? noteSelection.startEvent : 0;
        const endIdx = mi === noteSelection.endMeasure ? noteSelection.endEvent : voice.events.length - 1;
        for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
          selectedNoteIds.add(voice.events[i].id);
        }
      }
      const selHead = inputState.selectedHeadIndex;
      if (
        selHead != null &&
        noteSelection.startMeasure === noteSelection.endMeasure &&
        noteSelection.startEvent === noteSelection.endEvent
      ) {
        const evt = score.parts[noteSelection.partIndex]
          ?.measures[noteSelection.startMeasure]
          ?.voices[noteSelection.voiceIndex]
          ?.events[noteSelection.startEvent];
        if (evt && evt.kind === "chord") {
          selectedHeadByEventId = new Map([[evt.id, selHead]]);
        }
      }
    }
    return { selectedNoteIds, selectedHeadByEventId };
  }

  // Helper: draw the rectangular selection band overlay.
  function drawSelectionBand(rawCtx: CanvasRenderingContext2D, result: ReturnType<typeof renderScore>) {
    if (!noteSelection || !noteSelection.rangeMode) return;
    rawCtx.save();
    rawCtx.fillStyle = NOTE_SELECTION_BAND;
    const selStaveIndex = inputState.cursor.staveIndex ?? 0;
    const staveBoxes = new Map<string, (typeof result.hitBoxes)[0]>();
    for (const hb of result.hitBoxes) {
      if (hb.partIndex === noteSelection.partIndex && (hb.staveIndex ?? 0) === selStaveIndex) {
        staveBoxes.set(hb.id, hb);
      }
    }
    const bands = new Map<number, { minX: number; maxX: number; y: number; height: number }>();
    for (let mi = noteSelection.startMeasure; mi <= noteSelection.endMeasure; mi++) {
      const voice = score.parts[noteSelection.partIndex]?.measures[mi]?.voices[noteSelection.voiceIndex];
      if (!voice) continue;
      const mp = result.measurePositions.find(
        (p) => p.partIndex === noteSelection.partIndex && p.measureIndex === mi && p.staveIndex === selStaveIndex
      );
      if (!mp) continue;
      const startIdx = mi === noteSelection.startMeasure ? noteSelection.startEvent : 0;
      const endIdx = mi === noteSelection.endMeasure ? noteSelection.endEvent : voice.events.length - 1;
      for (let i = startIdx; i <= endIdx && i < voice.events.length; i++) {
        const box = staveBoxes.get(voice.events[i].id) ?? result.noteBoxes.get(voice.events[i].id);
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

  // Full layout render: triggered by score, cursor, view config, etc.
  // Does NOT depend on playbackTick — that's handled by the lightweight effect below.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = containerWidth / zoom;
    const effectiveViewConfig = applyDisplaySettings(viewConfig, displaySettings);
    const contentHeight = calculateContentHeight(score, effectiveViewConfig, width);
    const height = Math.max(contentHeight, container.clientHeight / zoom);

    const ctx = initRenderer(canvas, width, height, zoom);
    setCanvasHeight(height);

    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    rawCtx.save();
    rawCtx.fillStyle = CANVAS_BACKGROUND;
    rawCtx.fillRect(0, 0, width, height);
    rawCtx.restore();

    const { selectedNoteIds, selectedHeadByEventId } = buildNoteSelectionSets();

    const result = renderScore(
      ctx, canvas, score, inputState.cursor, playbackTickRef.current, effectiveViewConfig, width,
      noteSelection ? null : selection, inputState.pendingPitch,
      selectedNoteIds, selectedHeadByEventId,
    );

    drawSelectionBand(rawCtx, result);

    setNoteBoxes(result.noteBoxes, result.hitBoxes);
    setAnnotationBoxes(result.annotationBoxes);
    setBreakBoxes(result.breakBoxes);
    setMeasurePositions(result.measurePositions);
    layoutGenRef.current++;
  }, [score, inputState.cursor, inputState.pendingPitch, inputState.tabString, inputState.tabFretBuffer, inputState.selectedHeadIndex, inputState.noteEntry, viewConfig, containerWidth, zoom, selection, noteSelection, editingTitle, editingComposer, hiddenParts, displaySettings, setNoteBoxes, setAnnotationBoxes, setBreakBoxes, setMeasurePositions]);

  // Lightweight playback redraw: only re-renders the canvas for cursor/highlight
  // updates without rebuilding hit-box maps or triggering cascading Zustand updates.
  // This runs at ~30fps during playback (throttled upstream in TonePlayback).
  useEffect(() => {
    // Skip if the layout effect already rendered with this generation
    // (it reads playbackTickRef.current, so it's already up to date).
    if (playbackGenRef.current === layoutGenRef.current) {
      // Layout didn't change — only playbackTick did, so do a cheap canvas redraw.
    } else {
      // Layout effect just ran and already rendered with the current tick.
      playbackGenRef.current = layoutGenRef.current;
      return;
    }

    if (playbackTick == null) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = containerWidth / zoom;
    const effectiveViewConfig = applyDisplaySettings(viewConfig, displaySettings);
    const height = canvasHeight;

    const ctx = initRenderer(canvas, width, height, zoom);

    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    rawCtx.save();
    rawCtx.fillStyle = CANVAS_BACKGROUND;
    rawCtx.fillRect(0, 0, width, height);
    rawCtx.restore();

    const { selectedNoteIds, selectedHeadByEventId } = buildNoteSelectionSets();

    const result = renderScore(
      ctx, canvas, score, inputState.cursor, playbackTick, effectiveViewConfig, width,
      noteSelection ? null : selection, inputState.pendingPitch,
      selectedNoteIds, selectedHeadByEventId,
    );

    drawSelectionBand(rawCtx, result);

    // Intentionally skip setNoteBoxes/setAnnotationBoxes/setBreakBoxes/setMeasurePositions:
    // layout hasn't changed, only the playback cursor position and active-note highlights.
    // This eliminates 4 cascading Zustand updates per frame (~30fps) during playback.
  }, [playbackTick]);

  return (
    <div
      ref={containerRef}
      data-score-container=""
      style={{ flex: 1, overflow: "auto", background: CANVAS_BACKGROUND, minWidth: 0, position: "relative" }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <ScoreOverlay width={containerWidth / zoom} height={canvasHeight} zoom={zoom} />
      <AnnotationPopover />
    </div>
  );
}
