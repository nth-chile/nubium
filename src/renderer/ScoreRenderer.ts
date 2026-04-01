import type { Score, NoteEventId } from "../model";
import { TICKS_PER_QUARTER, durationToTicks } from "../model/duration";
import { renderMeasure, renderMultiMeasureRest, renderSystemBarline, clearCanvas, type RenderContext, type NoteBox, type AnnotationBox } from "./vexBridge";
import { renderTabMeasure } from "./TabRenderer";
import { computeLayout, totalContentHeight, totalPageCount, partStaveCount, DEFAULT_LAYOUT, type LayoutConfig } from "./SystemLayout";
import type { CursorPosition } from "../input/InputState";
import type { ViewConfig, AnnotationFilter } from "../views/ViewMode";
import type { Annotation } from "../model/annotations";
import type { Selection } from "../plugins/PluginAPI";
import type { Measure } from "../model";
import { useEditorStore } from "../state/EditorState";

/** Check if a measure contains only rests or empty voices (rendering-only check). */
function isMeasureAllRests(m: Measure): boolean {
  if (m.voices.length === 0) return true;
  return m.voices.every(v =>
    v.events.length === 0 || v.events.every(e => e.kind === "rest")
  );
}

/** Check if a measure has features that should break a multi-measure rest span. */
function breaksRestSpan(m: Measure, prev?: Measure): boolean {
  if (m.barlineEnd !== "single") return true;
  if (m.navigation?.segno || m.navigation?.coda || m.navigation?.volta) return true;
  if (m.navigation?.fine || m.navigation?.toCoda || m.navigation?.dsText || m.navigation?.dcText) return true;
  if (m.annotations.some(a => a.kind === "rehearsal-mark" || a.kind === "tempo-mark")) return true;
  if (prev) {
    if (prev.keySignature.fifths !== m.keySignature.fifths) return true;
    if (prev.timeSignature.numerator !== m.timeSignature.numerator ||
        prev.timeSignature.denominator !== m.timeSignature.denominator) return true;
    if (prev.clef.type !== m.clef.type) return true;
  }
  return false;
}

/**
 * Detect runs of consecutive all-rest measures within a range.
 * Returns a map from measure index to the length of the rest run starting there.
 * Only runs of length > 1 are included.
 */
function detectRestRuns(
  measures: Measure[],
  startMeasure: number,
  endMeasure: number,
): Map<number, number> {
  const runs = new Map<number, number>();
  let mi = startMeasure;
  while (mi < endMeasure) {
    if (isMeasureAllRests(measures[mi]) && !breaksRestSpan(measures[mi], measures[mi - 1])) {
      const runStart = mi;
      mi++;
      while (mi < endMeasure && isMeasureAllRests(measures[mi]) && !breaksRestSpan(measures[mi], measures[mi - 1])) {
        mi++;
      }
      const runLength = mi - runStart;
      if (runLength > 1) {
        runs.set(runStart, runLength);
      }
    } else {
      mi++;
    }
  }
  return runs;
}

export interface ScoreRenderResult {
  noteBoxes: Map<NoteEventId, NoteBox>;
  annotationBoxes: AnnotationBox[];
  measurePositions: { partIndex: number; measureIndex: number; x: number; y: number; width: number; height: number }[];
  contentHeight: number;
}

// Keep old constants exported for backward compatibility
const MEASURE_WIDTH = DEFAULT_LAYOUT.measureWidth;
const STAFF_HEIGHT = DEFAULT_LAYOUT.staffHeight + DEFAULT_LAYOUT.staffSpacing;
const LEFT_MARGIN = DEFAULT_LAYOUT.leftMargin;
const TOP_MARGIN = DEFAULT_LAYOUT.topMargin;
const MEASURES_PER_LINE = DEFAULT_LAYOUT.measuresPerLine;

function titleHeight(score: Score): number {
  const state = useEditorStore.getState();
  const hasComposer = !!score.composer || state.editingComposer;
  return 48 + (hasComposer ? 22 : 0) + 16;
}

export function calculateContentHeight(score: Score, viewConfig?: ViewConfig, availableWidth?: number): number {
  const width = availableWidth ?? 1000;
  const extra = titleHeight(score);
  if (!viewConfig) {
    return totalContentHeight(score, { ...DEFAULT_LAYOUT, adaptiveWidths: true, availableWidth: width, topMargin: DEFAULT_LAYOUT.topMargin + extra });
  }
  const visiblePartIndices = getVisiblePartIndices(score, viewConfig);
  const filteredScore = filterScoreParts(score, visiblePartIndices);
  const pageLayout = viewConfig.layoutConfig.pageLayout ?? false;
  const config: LayoutConfig = {
    ...DEFAULT_LAYOUT,
    adaptiveWidths: true,
    availableWidth: pageLayout ? DEFAULT_LAYOUT.pageWidth : width,
    topMargin: DEFAULT_LAYOUT.topMargin + extra,
    ...(viewConfig.layoutConfig.measuresPerLine != null
      ? { measuresPerLine: viewConfig.layoutConfig.measuresPerLine }
      : {}),
    ...(viewConfig.layoutConfig.compact
      ? { staffSpacing: 60 }
      : {}),
    ...(!viewConfig.layoutConfig.showPartNames ? { partLabelWidth: 0 } : {}),
    ...(pageLayout ? { pageBreaks: true } : {}),
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
  availableWidth?: number,
  selection?: Selection | null
): ScoreRenderResult {
  clearCanvas(ctx, canvas);

  // Compute active playback notes once for the entire render pass
  const activeNoteIds = (playbackTick != null && playbackTick >= 0)
    ? getActiveNoteIds(score, playbackTick)
    : undefined;

  // Determine which parts to render based on viewConfig
  const visiblePartIndices = getVisiblePartIndices(score, viewConfig);
  const annotationFilter = viewConfig?.showAnnotations;
  const showPartNames = viewConfig?.layoutConfig.showPartNames ?? true;
  const isSongwriterMode = viewConfig?.type === "songwriter";

  // Build a filtered score for layout computation
  const filteredScore = filterScoreParts(score, visiblePartIndices);

  const effectiveWidth = availableWidth ?? canvas.width / (window.devicePixelRatio || 1);
  const pageLayoutEnabled = viewConfig?.layoutConfig.pageLayout ?? false;
  const layoutOverrides = viewConfig?.layoutConfig;
  const pageW = layoutOverrides?.pageWidth ?? DEFAULT_LAYOUT.pageWidth;
  const pageH = layoutOverrides?.pageHeight ?? DEFAULT_LAYOUT.pageHeight;
  let config: LayoutConfig = {
    ...DEFAULT_LAYOUT,
    adaptiveWidths: true,
    availableWidth: pageLayoutEnabled ? pageW : effectiveWidth,
    ...(pageLayoutEnabled ? { pageWidth: pageW, pageHeight: pageH } : {}),
    ...(layoutOverrides?.topMargin != null ? { topMargin: layoutOverrides.topMargin } : {}),
    ...(layoutOverrides?.bottomMargin != null ? { bottomMargin: layoutOverrides.bottomMargin } : {}),
    ...(layoutOverrides?.leftMargin != null ? { leftMargin: layoutOverrides.leftMargin } : {}),
    ...(layoutOverrides?.measuresPerLine != null
      ? { measuresPerLine: layoutOverrides.measuresPerLine }
      : {}),
    ...(layoutOverrides?.compact
      ? { staffSpacing: 60 }
      : {}),
    ...(!showPartNames ? { partLabelWidth: 0 } : {}),
    ...(pageLayoutEnabled ? { pageBreaks: true } : {}),
  };
  // Add space for title/composer above the first system
  const editorState = useEditorStore.getState();
  const hasComposer = !!score.composer || editorState.editingComposer;
  const tHeight = 48 + (hasComposer ? 22 : 0) + 16;
  config = { ...config, topMargin: config.topMargin + tHeight };

  const systems = computeLayout(filteredScore, config);

  const allNoteBoxes = new Map<NoteEventId, NoteBox>();
  const allAnnotationBoxes: AnnotationBox[] = [];
  const measurePositions: ScoreRenderResult["measurePositions"] = [];

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;

  // Draw page backgrounds and boundaries when page layout is active
  if (pageLayoutEnabled && rawCtx.save) {
    const pages = totalPageCount(filteredScore, config);
    rawCtx.save();
    for (let p = 0; p < pages; p++) {
      const pageTop = p * config.pageHeight;
      // Soft off-white page background (less contrast against dark canvas)
      rawCtx.fillStyle = "#ffffff";
      const pageX = pageLayoutEnabled ? (effectiveWidth - config.pageWidth) / 2 : 0;
      rawCtx.fillRect(Math.max(pageX, 0), pageTop, config.pageWidth, config.pageHeight);

      // Page boundary line at the bottom of each page (except the last)
      if (p < pages - 1) {
        rawCtx.strokeStyle = "#cccccc";
        rawCtx.lineWidth = 1;
        rawCtx.setLineDash([4, 4]);
        rawCtx.beginPath();
        rawCtx.moveTo(0, pageTop + config.pageHeight);
        rawCtx.lineTo(effectiveWidth, pageTop + config.pageHeight);
        rawCtx.stroke();
      }
    }
    rawCtx.setLineDash([]);
    rawCtx.restore();
  }

  // Calculate title/composer positions for HTML overlay (no canvas text drawing)
  const titlePositions: { title?: { x: number; y: number; width: number; height: number }; composer?: { x: number; y: number; width: number; height: number } } = {};
  {
    const centerX = pageLayoutEnabled ? config.pageWidth / 2 : effectiveWidth / 2;
    let y = DEFAULT_LAYOUT.topMargin;

    // Always provide a title region (even when empty) so the overlay can be clicked
    const titleW = Math.max(effectiveWidth * 0.6, 200);
    titlePositions.title = { x: centerX - titleW / 2, y: y - 24, width: titleW, height: 34 };
    y += 34;

    if (hasComposer) {
      const composerW = Math.max(effectiveWidth * 0.4, 150);
      titlePositions.composer = { x: centerX - composerW / 2, y: y - 14, width: composerW, height: 20 };
    }
  }
  useEditorStore.getState().setTitlePositions(titlePositions);

  for (const system of systems) {
    const isFirstSystem = system.lineIndex === 0;

    // Render each visible part's measures in this system
    for (let filteredPi = 0; filteredPi < filteredScore.parts.length; filteredPi++) {
      const originalPi = visiblePartIndices[filteredPi];
      const part = filteredScore.parts[filteredPi];
      const staveCount = partStaveCount(filteredScore, filteredPi);
      const useTab = viewConfig?.staffType[originalPi] === "tab";

      // Detect consecutive rest measure runs for multi-measure rest rendering
      const restRuns = detectRestRuns(part.measures, system.startMeasure, system.endMeasure);

      for (let si = 0; si < staveCount; si++) {
        const staveLayouts = system.staves.filter(
          (s) => s.partIndex === filteredPi && s.staveIndex === si
        );

        let mi = system.startMeasure;
        while (mi < system.endMeasure) {
          const m = part.measures[mi];
          if (!m) { mi++; continue; }

          const posInLine = mi - system.startMeasure;
          const isFirstInLine = posInLine === 0;
          const layout = staveLayouts[posInLine];
          if (!layout) { mi++; continue; }

          // Check for multi-measure rest run starting at this measure
          const restRunLength = restRuns.get(mi);
          if (restRunLength && !useTab) {
            // Combine widths of all measures in the rest run
            let combinedWidth = 0;
            for (let r = 0; r < restRunLength; r++) {
              const rl = staveLayouts[posInLine + r];
              if (rl) combinedWidth += rl.width;
            }

            let measureToRender = m;
            if (staveCount === 2 && si === 1) {
              measureToRender = { ...measureToRender, clef: { type: "bass" as const } };
            }

            renderMultiMeasureRest(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              combinedWidth,
              restRunLength,
              isFirstInLine,
              isFirstInLine,
            );

            // Add measure positions for all measures in the run (for cursor/selection)
            if (si === 0) {
              for (let r = 0; r < restRunLength; r++) {
                const rl = staveLayouts[posInLine + r];
                if (rl) {
                  measurePositions.push({
                    partIndex: originalPi,
                    measureIndex: mi + r,
                    x: layout.x,
                    y: layout.y,
                    width: combinedWidth,
                    height: config.staffHeight,
                  });
                }
              }
            }

            mi += restRunLength;
            continue;
          }

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
              isFirstInLine,
              undefined,
              originalPi,
              mi
            );
          } else {
            // Show time/key sig on first measure or when they change
            // Pickup measures don't show time sig — it goes on the next measure
            const prevMeasure = mi > 0 ? part.measures[mi - 1] : undefined;
            const isPickup = m.isPickup;
            const prevIsPickup = prevMeasure?.isPickup;
            const timeSigChanged = isPickup ? false :
              (mi === 0 || prevIsPickup || (prevMeasure != null && (
                m.timeSignature.numerator !== prevMeasure.timeSignature.numerator ||
                m.timeSignature.denominator !== prevMeasure.timeSignature.denominator
              )));
            const keySigChanged = isFirstInLine || (prevMeasure != null &&
              m.keySignature.fifths !== prevMeasure.keySignature.fifths
            );
            const clefChanged = isFirstInLine || (prevMeasure != null &&
              m.clef.type !== prevMeasure.clef.type
            );

            result = renderMeasure(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              layout.width,
              clefChanged,
              timeSigChanged,
              keySigChanged,
              score.stylesheet,
              originalPi,
              mi,
              activeNoteIds
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
              height: config.staffHeight,
            });
          }

          for (const nb of result.noteBoxes) {
            allNoteBoxes.set(nb.id, nb);
          }
          if ('annotationBoxes' in result) {
            for (const ab of (result as { annotationBoxes: AnnotationBox[] }).annotationBoxes) {
              allAnnotationBoxes.push(ab);
            }
          }

          // In songwriter mode, render chord symbols larger above the staff
          if (isSongwriterMode && si === 0) {
            renderSongwriterChords(rawCtx, measureToRender, layout.x, layout.y, layout.width);
          }

          mi++;
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

  // Draw selection highlight
  if (selection) {
    drawSelection(rawCtx, selection, measurePositions, config);
  }

  // Draw cursor
  if (cursor) {
    drawCursor(ctx, canvas, score, cursor, measurePositions, config, allNoteBoxes);
  }

  // Draw playback cursor
  if (playbackTick != null && playbackTick >= 0) {
    drawPlaybackCursor(ctx, score, playbackTick, measurePositions, config, allNoteBoxes);
  }

  const contentHeight = totalContentHeight(score, config);

  return { noteBoxes: allNoteBoxes, annotationBoxes: allAnnotationBoxes, measurePositions, contentHeight };
}

const VOICE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444"];

function drawCursor(
  ctx: RenderContext,
  canvas: HTMLCanvasElement,
  score: Score,
  cursor: CursorPosition,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig,
  noteBoxes?: Map<NoteEventId, NoteBox>
): void {
  const mp = measurePositions.find(
    (p) => p.partIndex === cursor.partIndex && p.measureIndex === cursor.measureIndex
  );
  if (!mp) return;

  // Use VexFlow's context for coordinates (handles DPR scaling),
  // but reach into the real canvas context to set lineWidth directly
  // (VexFlow's wrapper ignores lineWidth assignments).
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  const canvasCtx = canvas.getContext("2d");
  if (!rawCtx.strokeStyle) return;

  const cursorColor = VOICE_COLORS[cursor.voiceIndex] ?? VOICE_COLORS[0];

  // Try to find the actual noteBox at the cursor position
  let targetBox: NoteBox | undefined;
  if (noteBoxes) {
    const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    if (voice && cursor.eventIndex < voice.events.length) {
      const eventId = voice.events[cursor.eventIndex].id;
      targetBox = noteBoxes.get(eventId);
    }
  }

  // Determine cursor X position
  let cursorX: number;
  if (targetBox) {
    cursorX = targetBox.headX + targetBox.headWidth / 2;
  } else {
    // Append position: after the last note in the measure
    const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    const eventCount = voice?.events.length ?? 0;
    cursorX = mp.x + 60;
    if (noteBoxes && voice) {
      for (let i = eventCount - 1; i >= 0; i--) {
        const nb = noteBoxes.get(voice.events[i].id);
        if (nb) {
          cursorX = nb.x + nb.width + 10;
          break;
        }
      }
    }
  }

  const staffTop = mp.y;
  const staffBottom = mp.y + config.staffHeight;

  rawCtx.save();

  // Draw note highlight rect if on a note
  if (targetBox) {
    rawCtx.strokeStyle = cursorColor;
    rawCtx.lineWidth = 2;
    const pad = 3;
    rawCtx.beginPath();
    rawCtx.rect(targetBox.headX - pad, targetBox.headY - pad, targetBox.headWidth + pad * 2, targetBox.headHeight + pad * 2);
    rawCtx.stroke();
  }

  // Draw vertical cursor line spanning full staff.
  // Set lineWidth on the real canvas context so it actually takes effect
  // (VexFlow's context wrapper ignores lineWidth assignments).
  rawCtx.strokeStyle = cursorColor;
  rawCtx.lineWidth = 1;
  if (canvasCtx) canvasCtx.lineWidth = 1 * (window.devicePixelRatio || 1);
  rawCtx.setLineDash([6, 4]);
  rawCtx.beginPath();
  rawCtx.moveTo(cursorX, staffBottom);
  rawCtx.lineTo(cursorX, staffTop);
  rawCtx.stroke();

  // Draw inverted caret (triangle) sitting on the top staff line
  rawCtx.setLineDash([]);
  rawCtx.fillStyle = cursorColor;
  rawCtx.beginPath();
  rawCtx.moveTo(cursorX - 5, staffTop);
  rawCtx.lineTo(cursorX + 5, staffTop);
  rawCtx.lineTo(cursorX, staffTop + 8);
  rawCtx.closePath();
  rawCtx.fill();

  rawCtx.restore();
}

function getActiveNoteIds(score: Score, playbackTick: number): Set<NoteEventId> {
  const active = new Set<NoteEventId>();
  let accumulated = 0;

  for (const part of score.parts) {
    if (part.muted) continue;
    accumulated = 0;
    for (const measure of part.measures) {
      const ts = measure.timeSignature;
      const measureTicks = (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;
      if (accumulated > playbackTick) break;

      for (const voice of measure.voices) {
        let offset = accumulated;
        for (const evt of voice.events) {
          const evtTicks = durationToTicks(evt.duration);
          if (offset <= playbackTick && playbackTick < offset + evtTicks) {
            if (evt.kind === "note" || evt.kind === "chord") {
              active.add(evt.id);
            }
          }
          offset += evtTicks;
        }
      }
      accumulated += measureTicks;
    }
  }
  return active;
}

function drawPlaybackCursor(
  ctx: RenderContext,
  score: Score,
  playbackTick: number,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig,
  noteBoxes: Map<NoteEventId, NoteBox>,
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

  // Smoothly interpolate between note positions
  const measureNotes = Array.from(noteBoxes.values())
    .filter((nb) => nb.partIndex === 0 && nb.measureIndex === targetMeasureIndex && nb.voiceIndex === 0)
    .sort((a, b) => a.eventIndex - b.eventIndex);

  const ts = part.measures[targetMeasureIndex].timeSignature;
  const measureTicks =
    (TICKS_PER_QUARTER * 4 * ts.numerator) / ts.denominator;

  let cursorX: number;
  if (measureNotes.length > 0) {
    const voice = part.measures[targetMeasureIndex]?.voices[0];
    const events = voice?.events ?? [];

    // Build tick→x mapping from actual note positions
    const tickXPairs: { tick: number; x: number }[] = [];
    let tick = 0;
    for (let i = 0; i < events.length; i++) {
      const nb = measureNotes.find((n) => n.eventIndex === i);
      if (nb) tickXPairs.push({ tick, x: nb.headX });
      tick += durationToTicks(events[i].duration);
    }
    // End-of-measure position
    tickXPairs.push({ tick: measureTicks, x: mp.x + mp.width - 10 });

    if (tickXPairs.length >= 2) {
      // Find the two points to interpolate between
      let lo = tickXPairs[0], hi = tickXPairs[tickXPairs.length - 1];
      for (let i = 0; i < tickXPairs.length - 1; i++) {
        if (tickInMeasure >= tickXPairs[i].tick && tickInMeasure < tickXPairs[i + 1].tick) {
          lo = tickXPairs[i];
          hi = tickXPairs[i + 1];
          break;
        }
      }
      const range = hi.tick - lo.tick;
      const t = range > 0 ? (tickInMeasure - lo.tick) / range : 0;
      cursorX = lo.x + t * (hi.x - lo.x);
    } else {
      cursorX = tickXPairs[0]?.x ?? mp.x + 60;
    }
  } else {
    // Fallback to linear interpolation for empty measures
    const fraction = Math.min(tickInMeasure / measureTicks, 1);
    const usableWidth = mp.width - 60;
    cursorX = mp.x + 60 + fraction * usableWidth;
  }

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.strokeStyle !== undefined) {
    rawCtx.save();
    rawCtx.strokeStyle = "#888";
    rawCtx.lineWidth = 3;
    rawCtx.setLineDash([]);
    rawCtx.globalAlpha = 0.7;
    rawCtx.beginPath();
    rawCtx.moveTo(cursorX, mp.y);
    rawCtx.lineTo(cursorX, mp.y + config.staffHeight);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

function drawSelection(
  rawCtx: CanvasRenderingContext2D,
  selection: Selection,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig
): void {
  rawCtx.save();
  rawCtx.fillStyle = "rgba(66, 133, 244, 0.15)";
  for (const mp of measurePositions) {
    if (
      mp.partIndex === selection.partIndex &&
      mp.measureIndex >= selection.measureStart &&
      mp.measureIndex <= selection.measureEnd
    ) {
      rawCtx.fillRect(mp.x, mp.y, mp.width, config.staffHeight);
    }
  }
  rawCtx.restore();
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
