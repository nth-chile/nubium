import type { Score, NoteEventId } from "../model";
import { TICKS_PER_QUARTER } from "../model/duration";
import { renderMeasure, renderSystemBarline, clearCanvas, type RenderContext, type NoteBox } from "./vexBridge";
import { renderTabMeasure } from "./TabRenderer";
import { computeLayout, totalContentHeight, partStaveCount, DEFAULT_LAYOUT, type LayoutConfig } from "./SystemLayout";
import type { CursorPosition } from "../input/InputState";
import type { ViewConfig, AnnotationFilter } from "../views/ViewMode";
import type { Annotation } from "../model/annotations";

export interface ScoreRenderResult {
  noteBoxes: Map<NoteEventId, NoteBox>;
  measurePositions: { partIndex: number; measureIndex: number; x: number; y: number; width: number }[];
  contentHeight: number;
}

// Keep old constants exported for backward compatibility
const MEASURE_WIDTH = DEFAULT_LAYOUT.measureWidth;
const STAFF_HEIGHT = DEFAULT_LAYOUT.staffHeight + DEFAULT_LAYOUT.staffSpacing;
const LEFT_MARGIN = DEFAULT_LAYOUT.leftMargin;
const TOP_MARGIN = DEFAULT_LAYOUT.topMargin;
const MEASURES_PER_LINE = DEFAULT_LAYOUT.measuresPerLine;

export function calculateContentHeight(score: Score, viewConfig?: ViewConfig, availableWidth?: number): number {
  const width = availableWidth ?? 1000;
  if (!viewConfig) {
    return totalContentHeight(score, { ...DEFAULT_LAYOUT, adaptiveWidths: true, availableWidth: width });
  }
  const visiblePartIndices = getVisiblePartIndices(score, viewConfig);
  const filteredScore = filterScoreParts(score, visiblePartIndices);
  const config: LayoutConfig = {
    ...DEFAULT_LAYOUT,
    adaptiveWidths: true,
    availableWidth: width,
    ...(viewConfig.layoutConfig.measuresPerLine != null
      ? { measuresPerLine: viewConfig.layoutConfig.measuresPerLine }
      : {}),
    ...(viewConfig.layoutConfig.compact
      ? { staffSpacing: 60 }
      : {}),
    ...(!viewConfig.layoutConfig.showPartNames ? { partLabelWidth: 0 } : {}),
  };
  return totalContentHeight(filteredScore, config);
}

export function renderScore(
  ctx: RenderContext,
  canvas: HTMLCanvasElement,
  score: Score,
  cursor?: CursorPosition,
  playbackTick?: number | null,
  viewConfig?: ViewConfig,
  availableWidth?: number
): ScoreRenderResult {
  clearCanvas(ctx, canvas);

  // Determine which parts to render based on viewConfig
  const visiblePartIndices = getVisiblePartIndices(score, viewConfig);
  const annotationFilter = viewConfig?.showAnnotations;
  const showPartNames = viewConfig?.layoutConfig.showPartNames ?? true;
  const isSongwriterMode = viewConfig?.type === "songwriter";

  // Build a filtered score for layout computation
  const filteredScore = filterScoreParts(score, visiblePartIndices);

  const effectiveWidth = availableWidth ?? canvas.width / (window.devicePixelRatio || 1);
  const config: LayoutConfig = {
    ...DEFAULT_LAYOUT,
    adaptiveWidths: true,
    availableWidth: effectiveWidth,
    ...(viewConfig?.layoutConfig.measuresPerLine != null
      ? { measuresPerLine: viewConfig.layoutConfig.measuresPerLine }
      : {}),
    ...(viewConfig?.layoutConfig.compact
      ? { staffSpacing: 60 }
      : {}),
    ...(!showPartNames ? { partLabelWidth: 0 } : {}),
  };
  const systems = computeLayout(filteredScore, config);

  const allNoteBoxes = new Map<NoteEventId, NoteBox>();
  const measurePositions: ScoreRenderResult["measurePositions"] = [];

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;

  for (const system of systems) {
    const isFirstSystem = system.lineIndex === 0;

    // Render each visible part's measures in this system
    for (let filteredPi = 0; filteredPi < filteredScore.parts.length; filteredPi++) {
      const originalPi = visiblePartIndices[filteredPi];
      const part = filteredScore.parts[filteredPi];
      const staveCount = partStaveCount(filteredScore, filteredPi);
      const useTab = viewConfig?.staffType[originalPi] === "tab";

      for (let si = 0; si < staveCount; si++) {
        for (let mi = system.startMeasure; mi < system.endMeasure; mi++) {
          const m = part.measures[mi];
          if (!m) continue;

          const posInLine = mi - system.startMeasure;
          const isFirstInLine = posInLine === 0;

          // Calculate position from stave layouts
          const staveLayouts = system.staves.filter(
            (s) => s.partIndex === filteredPi && s.staveIndex === si
          );
          const layout = staveLayouts[posInLine];
          if (!layout) continue;

          // Filter annotations based on viewConfig
          let measureToRender = m;
          if (annotationFilter) {
            measureToRender = {
              ...m,
              annotations: filterAnnotations(m.annotations, annotationFilter),
            };
          }

          // For grand staff, determine the clef for this stave
          if (staveCount === 2 && si === 1) {
            measureToRender = { ...measureToRender, clef: { type: "bass" as const } };
          }

          let result;
          if (useTab && si === 0) {
            // Render as tab staff
            result = renderTabMeasure(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              layout.width,
              isFirstInLine
            );
          } else {
            result = renderMeasure(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              layout.width,
              isFirstInLine,
              mi === 0,
              isFirstInLine,
              score.stylesheet
            );
          }

          // Only add to measurePositions for the primary stave (staveIndex 0)
          if (si === 0) {
            measurePositions.push({
              partIndex: originalPi,
              measureIndex: mi,
              x: layout.x,
              y: layout.y,
              width: layout.width,
            });
          }

          for (const nb of result.noteBoxes) {
            allNoteBoxes.set(nb.id, nb);
          }

          // In songwriter mode, render chord symbols larger above the staff
          if (isSongwriterMode && si === 0) {
            renderSongwriterChords(rawCtx, measureToRender, layout.x, layout.y, layout.width);
          }
        }
      }
    }

    // Draw part names on the left
    if (rawCtx.save && showPartNames) {
      for (let filteredPi = 0; filteredPi < filteredScore.parts.length; filteredPi++) {
        const part = filteredScore.parts[filteredPi];
        const staveLayouts = system.staves.filter(
          (s) => s.partIndex === filteredPi && s.staveIndex === 0
        );
        if (staveLayouts.length === 0) continue;

        const firstStave = staveLayouts[0];
        const labelX = config.leftMargin;
        const labelY = firstStave.y + config.staffHeight / 2 + 4;

        rawCtx.save();
        rawCtx.font = isFirstSystem ? "bold 11px sans-serif" : "10px sans-serif";
        rawCtx.fillStyle = "#333";
        rawCtx.textAlign = "left";
        rawCtx.fillText(
          isFirstSystem ? part.name : part.abbreviation,
          labelX,
          labelY
        );
        rawCtx.textAlign = "start";
        rawCtx.restore();
      }

      // Draw system barlines (vertical line connecting all staves at the start of each system)
      if (filteredScore.parts.length > 1) {
        const firstPartStaves = system.staves.filter(
          (s) => s.partIndex === 0 && s.staveIndex === 0
        );
        const lastPartIndex = filteredScore.parts.length - 1;
        const lastStaveIdx = partStaveCount(filteredScore, lastPartIndex) - 1;
        const lastPartStaves = system.staves.filter(
          (s) => s.partIndex === lastPartIndex && s.staveIndex === lastStaveIdx
        );

        if (firstPartStaves.length > 0 && lastPartStaves.length > 0) {
          const topY = firstPartStaves[0].y;
          const bottomY = lastPartStaves[0].y + config.staffHeight;
          const barlineX = firstPartStaves[0].x;

          renderSystemBarline(ctx, barlineX, topY, bottomY);
        }
      }
    }
  }

  // Draw cursor
  if (cursor) {
    drawCursor(ctx, score, cursor, measurePositions, config);
  }

  // Draw playback cursor
  if (playbackTick != null && playbackTick >= 0) {
    drawPlaybackCursor(ctx, score, playbackTick, measurePositions, config);
  }

  const contentHeight = totalContentHeight(score, config);

  return { noteBoxes: allNoteBoxes, measurePositions, contentHeight };
}

function drawCursor(
  ctx: RenderContext,
  score: Score,
  cursor: CursorPosition,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig
): void {
  const mp = measurePositions.find(
    (p) => p.partIndex === cursor.partIndex && p.measureIndex === cursor.measureIndex
  );
  if (!mp) return;

  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  if (!voice) return;

  const eventCount = voice.events.length;
  const usableWidth = mp.width - 60;
  const eventSpacing = eventCount > 0 ? usableWidth / (eventCount + 1) : usableWidth / 2;
  const cursorX = mp.x + 60 + cursor.eventIndex * eventSpacing;

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.strokeStyle !== undefined) {
    rawCtx.save();
    rawCtx.strokeStyle = "#2563eb";
    rawCtx.lineWidth = 2;
    rawCtx.setLineDash([4, 4]);
    rawCtx.beginPath();
    rawCtx.moveTo(cursorX, mp.y + 10);
    rawCtx.lineTo(cursorX, mp.y + config.staffHeight - 10);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

function drawPlaybackCursor(
  ctx: RenderContext,
  score: Score,
  playbackTick: number,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig
): void {
  const part = score.parts[0];
  if (!part) return;

  let accumulated = 0;
  let targetMeasureIndex = 0;
  let tickInMeasure = 0;

  for (let mi = 0; mi < part.measures.length; mi++) {
    const ts = part.measures[mi].timeSignature;
    const measureTicks =
      (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
    if (accumulated + measureTicks > playbackTick) {
      targetMeasureIndex = mi;
      tickInMeasure = playbackTick - accumulated;
      break;
    }
    accumulated += measureTicks;
    if (mi === part.measures.length - 1) {
      targetMeasureIndex = mi;
      tickInMeasure = measureTicks;
    }
  }

  const mp = measurePositions.find(
    (p) => p.partIndex === 0 && p.measureIndex === targetMeasureIndex
  );
  if (!mp) return;

  const ts = part.measures[targetMeasureIndex].timeSignature;
  const measureTicks =
    (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
  const fraction = Math.min(tickInMeasure / measureTicks, 1);
  const usableWidth = mp.width - 60;
  const cursorX = mp.x + 60 + fraction * usableWidth;

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.strokeStyle !== undefined) {
    rawCtx.save();
    rawCtx.strokeStyle = "#10b981";
    rawCtx.lineWidth = 2.5;
    rawCtx.setLineDash([]);
    rawCtx.globalAlpha = 0.8;
    rawCtx.beginPath();
    rawCtx.moveTo(cursorX, mp.y + 10);
    rawCtx.lineTo(cursorX, mp.y + config.staffHeight - 10);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

/**
 * Get the list of visible part indices based on view config.
 */
function getVisiblePartIndices(score: Score, viewConfig?: ViewConfig): number[] {
  if (!viewConfig || viewConfig.partsToShow === "all") {
    return score.parts.map((_, i) => i);
  }
  return viewConfig.partsToShow.filter((i) => i < score.parts.length);
}

/**
 * Build a filtered score containing only the visible parts.
 */
function filterScoreParts(score: Score, visiblePartIndices: number[]): Score {
  if (visiblePartIndices.length === score.parts.length) {
    return score;
  }
  return {
    ...score,
    parts: visiblePartIndices.map((i) => score.parts[i]),
  };
}

/**
 * Filter annotations based on allowed kinds.
 */
function filterAnnotations(
  annotations: Annotation[],
  allowedKinds: AnnotationFilter[]
): Annotation[] {
  return annotations.filter((a) => allowedKinds.includes(a.kind as AnnotationFilter));
}

/**
 * Render chord symbols with larger, more prominent text for songwriter mode.
 */
function renderSongwriterChords(
  rawCtx: CanvasRenderingContext2D,
  m: { annotations: Annotation[] },
  x: number,
  y: number,
  _width: number
): void {
  if (!rawCtx.save) return;
  const chords = m.annotations.filter((a) => a.kind === "chord-symbol");
  if (chords.length === 0) return;

  // Songwriter mode already renders chord symbols via the normal path,
  // but we draw an additional larger overlay
  // This is handled by the stylesheet override, so nothing extra needed here.
}

export { MEASURE_WIDTH, STAFF_HEIGHT, LEFT_MARGIN, TOP_MARGIN, MEASURES_PER_LINE };
