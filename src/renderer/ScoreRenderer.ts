import type { Score, NoteEventId } from "../model";
import { TICKS_PER_QUARTER, durationToTicks } from "../model/duration";
import { StaveTie, type StaveNote } from "vexflow";
import { renderMeasure, renderMultiMeasureRest, renderSystemBarline, renderBrace, clearCanvas, createVexStave, type RenderContext, type NoteBox, type AnnotationBox, type MeasureRenderResult } from "./vexBridge";
import { getMeasureIndexForTick } from "../playback/TonePlayback";
import { renderTabMeasure, type TabMeasureRenderResult } from "./TabRenderer";
import { renderSlashMeasure } from "./SlashRenderer";
import { computeLayout, totalContentHeight, totalPageCount, partStaveCount, partStandardStaveCount, partHasSlash, partHasTab, DEFAULT_LAYOUT, TAB_STAFF_HEIGHT, type LayoutConfig, type SystemLine } from "./SystemLayout";
import type { CursorPosition } from "../input/InputState";
import type { ViewConfig, AnnotationFilter } from "../views/ViewMode";
import { getPartDisplay, getEffectiveInputMode } from "../views/ViewMode";
import type { Annotation } from "../model/annotations";
import type { Selection } from "../plugins/PluginAPI";
import type { Measure } from "../model";
import { useEditorStore } from "../state/EditorState";

/** Detect whether time/key signature changed from the previous measure. */
function sigChanges(m: Measure, mi: number, prevMeasure: Measure | undefined, isFirstInLine: boolean) {
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
  return { timeSigChanged, keySigChanged };
}

/** Get voice indices for a given stave from a measure's voices. */
function voiceIndicesForStave(m: Measure, si: number, staveCount: number): number[] | undefined {
  if (staveCount < 2) return undefined;
  return m.voices
    .map((v, i) => (v.staff ?? 0) === si ? i : -1)
    .filter((i) => i >= 0);
}

/** Check if a measure contains only rests or empty voices (rendering-only check). */
function isMeasureAllRests(m: Measure | undefined): boolean {
  if (!m || m.voices.length === 0) return true;
  return m.voices.every(v =>
    v.events.length === 0 || v.events.every(e => e.kind === "rest")
  );
}

/** Check if a measure has features that should break a multi-measure rest span. */
function breaksRestSpan(m: Measure | undefined, prev?: Measure): boolean {
  if (!m) return true;
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
  /** All note boxes including duplicates across staves (standard + tab + slash) — used for click hit-testing */
  hitBoxes: NoteBox[];
  annotationBoxes: AnnotationBox[];
  measurePositions: { partIndex: number; measureIndex: number; staveIndex: number; x: number; y: number; width: number; height: number; noteStartX: number; isTab?: boolean }[];
  contentHeight: number;
}

// Keep old constants exported for backward compatibility
const MEASURE_WIDTH = DEFAULT_LAYOUT.measureWidth;
const STAFF_HEIGHT = DEFAULT_LAYOUT.staffHeight + DEFAULT_LAYOUT.staffSpacing;
const LEFT_MARGIN = DEFAULT_LAYOUT.leftMargin;
const TOP_MARGIN = DEFAULT_LAYOUT.topMargin;
const MEASURES_PER_LINE = DEFAULT_LAYOUT.measuresPerLine;

/** Build set of part indices that have tab notation enabled */
function getTabParts(viewConfig?: ViewConfig): Set<number> | undefined {
  if (!viewConfig) return undefined;
  const tabParts = new Set<number>();
  for (const [idx, display] of Object.entries(viewConfig.notationDisplay)) {
    if (display.tab) tabParts.add(Number(idx));
  }
  return tabParts.size > 0 ? tabParts : undefined;
}


function titleHeight(score: Score): number {
  const state = useEditorStore.getState();
  const hasComposer = !!score.composer || state.editingComposer;
  return 48 + (hasComposer ? 22 : 0) + 30;
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
  return totalContentHeight(filteredScore, config, getTabParts(viewConfig), viewConfig);
}

export function renderScore(
  ctx: RenderContext,
  canvas: HTMLCanvasElement,
  score: Score,
  cursor?: CursorPosition,
  playbackTick?: number | null,
  viewConfig?: ViewConfig,
  availableWidth?: number,
  selection?: Selection | null,
  pendingPitch?: { pitchClass: import("../model").PitchClass; octave: import("../model").Octave; accidental: import("../model").Accidental } | null,
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

  const tabParts = getTabParts(viewConfig);
  const systems = computeLayout(filteredScore, config, tabParts, viewConfig);

  const allNoteBoxes = new Map<NoteEventId, NoteBox>();
  const allHitBoxes: NoteBox[] = []; // all note boxes for hit testing (includes duplicates across staves)
  const allStaveNotes = new Map<NoteEventId, StaveNote>();
  const allAnnotationBoxes: AnnotationBox[] = [];
  const measurePositions: ScoreRenderResult["measurePositions"] = [];

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;

  // Draw page backgrounds and boundaries when page layout is active
  if (pageLayoutEnabled && rawCtx.save) {
    const pages = totalPageCount(filteredScore, config, tabParts, viewConfig);
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
      const partDisplay = viewConfig ? getPartDisplay(viewConfig, originalPi) : { standard: true, tab: false, slash: false };
      const standardStaves = viewConfig ? partStandardStaveCount(filteredScore, filteredPi, viewConfig) : (tabParts?.has(filteredPi) ? 0 : partStaveCount(filteredScore, filteredPi));
      const hasSlash = viewConfig ? partHasSlash(filteredPi, viewConfig) : false;
      const hasTab = partDisplay.tab;
      const slashStaveIdx = hasSlash ? standardStaves : -1;
      const tabStaveIdx = hasTab ? standardStaves + (hasSlash ? 1 : 0) : -1;
      const staveCount = standardStaves + (hasSlash ? 1 : 0) + (hasTab ? 1 : 0);

      // Detect consecutive rest measure runs for multi-measure rest rendering
      const restRuns = detectRestRuns(part.measures, system.startMeasure, system.endMeasure);

      // For grand staff: collect VexFlow Stave objects per measure/staveIndex for cross-staff rendering.
      // Pre-create bass stave (si=1) so treble (si=0) can use it for cross-staff notes.
      const grandStaffStaves = new Map<string, import("vexflow").Stave>();
      if (standardStaves >= 2) {
        const bassLayouts = system.staves.filter(
          (s) => s.partIndex === filteredPi && s.staveIndex === 1
        );
        for (let mi = system.startMeasure; mi < system.endMeasure; mi++) {
          const m = part.measures[mi];
          if (!m) continue;
          const posInLine = mi - system.startMeasure;
          const layout = bassLayouts[posInLine];
          if (!layout) continue;
          const bassMeasure = { ...m, clef: { type: "bass" as const } };
          const isFirstInLine = posInLine === 0;
          const prevMeasure = mi > 0 ? part.measures[mi - 1] : undefined;
          const { timeSigChanged, keySigChanged } = sigChanges(m, mi, prevMeasure, isFirstInLine);
          const stave = createVexStave(ctx, bassMeasure, layout.x, layout.y, layout.width, isFirstInLine, timeSigChanged, keySigChanged, prevMeasure?.keySignature.fifths);
          grandStaffStaves.set(`${mi}:1`, stave);
        }
      }

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
          const isTabStave = si === tabStaveIdx;
          const isSlashStave = si === slashStaveIdx;
          if (restRunLength && !isTabStave && !isSlashStave) {
            // Combine widths of all measures in the rest run
            let combinedWidth = 0;
            for (let r = 0; r < restRunLength; r++) {
              const rl = staveLayouts[posInLine + r];
              if (rl) combinedWidth += rl.width;
            }

            let measureToRender = m;
            if (standardStaves === 2 && si === 1) {
              measureToRender = { ...measureToRender, clef: { type: "bass" as const } };
            }

            const prevM = mi > 0 ? part.measures[mi - 1] : undefined;
            renderMultiMeasureRest(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              combinedWidth,
              restRunLength,
              isFirstInLine,
              isFirstInLine,
              prevM?.keySignature.fifths,
            );

            // Add measure positions for all measures in the run (for cursor/selection)
            for (let r = 0; r < restRunLength; r++) {
              const rl = staveLayouts[posInLine + r];
              if (rl) {
                measurePositions.push({
                  partIndex: originalPi,
                  measureIndex: mi + r,
                  staveIndex: si,
                  x: layout.x,
                  y: layout.y,
                  width: combinedWidth,
                  height: isTabStave ? TAB_STAFF_HEIGHT : config.staffHeight,
                  noteStartX: layout.x + 60,
                  isTab: isTabStave || undefined,
                });
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

          // When slash stave is separate, filter slash events out of standard stave
          // (they'll be rendered on the slash stave instead)
          if (hasSlash && si < slashStaveIdx) {
            measureToRender = {
              ...measureToRender,
              voices: measureToRender.voices.map((v) => ({
                ...v,
                events: v.events.map((e) =>
                  e.kind === "slash" ? { ...e, kind: "rest" as const } : e
                ),
              })),
            };
          }

          // For grand staff, determine the clef for this stave (not tab stave)
          if (standardStaves === 2 && si === 1 && !isTabStave) {
            measureToRender = { ...measureToRender, clef: { type: "bass" as const } };
          }

          let result: MeasureRenderResult | TabMeasureRenderResult;
          if (isTabStave) {
            // Render as tab staff
            result = renderTabMeasure(
              ctx,
              measureToRender,
              layout.x,
              layout.y,
              layout.width,
              isFirstInLine,
              part.tuning,
              originalPi,
              mi,
              part.capo ?? 0
            );
          } else if (si === slashStaveIdx) {
            // Slash stave: render rhythm slashes on a standard staff
            const prevMeasure = mi > 0 ? part.measures[mi - 1] : undefined;
            const { timeSigChanged, keySigChanged } = sigChanges(m, mi, prevMeasure, isFirstInLine);
            result = renderSlashMeasure(
              ctx, measureToRender, layout.x, layout.y, layout.width,
              isFirstInLine, timeSigChanged, keySigChanged,
              { partIndex: originalPi, measureIndex: mi, prevMeasure },
            );
          } else {
            const prevMeasure = mi > 0 ? part.measures[mi - 1] : undefined;
            const { timeSigChanged, keySigChanged } = sigChanges(m, mi, prevMeasure, isFirstInLine);
            const clefChanged = isFirstInLine || (prevMeasure != null &&
              m.clef.type !== prevMeasure.clef.type
            );

            // For grand staff cross-staff: look up the other stave's VexFlow Stave
            const otherSi = si === 0 ? 1 : 0;
            const crossStave = standardStaves >= 2 ? grandStaffStaves.get(`${mi}:${otherSi}`) : undefined;
            // The other stave's clef for creating StaveNotes with correct pitch mapping
            const crossClef = standardStaves >= 2 ? (si === 0 ? "bass" : "treble") : undefined;

            result = renderMeasure(
              ctx, measureToRender, layout.x, layout.y, layout.width,
              clefChanged, timeSigChanged, keySigChanged,
              {
                stylesheet: score.stylesheet,
                partIndex: originalPi,
                measureIndex: mi,
                activeNoteIds,
                prevMeasure: mi > 0 ? part.measures[mi - 1] : undefined,
                voiceFilter: voiceIndicesForStave(m, si, staveCount),
                staveIndex: si,
                crossStaffStave: crossStave,
                crossStaffClef: crossClef,
              },
            );

            // Store stave for cross-staff use by the other stave index
            if (standardStaves >= 2 && 'vexStave' in result && result.vexStave) {
              grandStaffStaves.set(`${mi}:${si}`, result.vexStave);
            }
          }

          measurePositions.push({
            partIndex: originalPi,
            measureIndex: mi,
            staveIndex: si,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: isTabStave ? TAB_STAFF_HEIGHT : config.staffHeight,
            noteStartX: ('vexStave' in result && result.vexStave) ? result.vexStave.getNoteStartX() : (layout.x + 60),
            isTab: isTabStave || undefined,
          });

          for (const nb of result.noteBoxes) {
            // Tag each noteBox with the stave it was rendered on
            nb.staveIndex = si;
            // Map stores first (standard) stave's boxes for cursor/slur positioning
            if (!allNoteBoxes.has(nb.id)) {
              allNoteBoxes.set(nb.id, nb);
            }
            // Array stores ALL boxes for click hit-testing across staves
            allHitBoxes.push(nb);
          }
          if ('staveNoteMap' in result) {
            for (const [id, sn] of (result as { staveNoteMap: Map<NoteEventId, StaveNote> }).staveNoteMap) {
              allStaveNotes.set(id, sn);
            }
          }
          if ('annotationBoxes' in result) {
            for (const ab of (result as { annotationBoxes: AnnotationBox[] }).annotationBoxes) {
              allAnnotationBoxes.push(ab);
            }
          }


          mi++;
        }
      }
    }

    // Draw part names, braces, and system barlines
    if (rawCtx.save) {
      for (let filteredPi = 0; filteredPi < filteredScore.parts.length; filteredPi++) {
        const part = filteredScore.parts[filteredPi];
        const sc = viewConfig ? partStandardStaveCount(filteredScore, filteredPi, viewConfig) : partStaveCount(filteredScore, filteredPi, tabParts);
        const stave0Layouts = system.staves.filter(
          (s) => s.partIndex === filteredPi && s.staveIndex === 0
        );
        if (stave0Layouts.length === 0) continue;

        const firstStave = stave0Layouts[0];

        // Part name labels — only when multiple parts are visible
        if (showPartNames && filteredScore.parts.length > 1) {
          const labelX = config.leftMargin;

          // Center label between top and bottom staves for grand staff
          let labelY: number;
          if (sc >= 2) {
            const stave1Layouts = system.staves.filter(
              (s) => s.partIndex === filteredPi && s.staveIndex === 1
            );
            const bottomY = stave1Layouts.length > 0
              ? stave1Layouts[0].y + config.staffHeight
              : firstStave.y + config.staffHeight;
            labelY = (firstStave.y + bottomY) / 2 + 4;
          } else {
            labelY = firstStave.y + config.staffHeight / 2 + 4;
          }

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

        // Draw brace for grand staff instruments
        if (sc >= 2) {
          const stave1Layouts = system.staves.filter(
            (s) => s.partIndex === filteredPi && s.staveIndex === 1
          );
          if (stave1Layouts.length > 0) {
            renderBrace(ctx, firstStave.x, firstStave.y, stave1Layouts[0].y + config.staffHeight);
          }
        }
      }

      // Draw system barlines (vertical line connecting all staves at the start of each system)
      // For grand staff single-part or multi-part scores
      {
        const firstPartStaves = system.staves.filter(
          (s) => s.partIndex === 0 && s.staveIndex === 0
        );
        const lastPartIndex = filteredScore.parts.length - 1;
        const lastTotalStaves = viewConfig ? partStaveCount(filteredScore, lastPartIndex, tabParts, viewConfig) : partStaveCount(filteredScore, lastPartIndex, tabParts);
        const lastStaveIdx = lastTotalStaves - 1;
        const lastPartStaves = system.staves.filter(
          (s) => s.partIndex === lastPartIndex && s.staveIndex === lastStaveIdx
        );

        // Draw if multiple parts, or if single part with grand staff
        const needsBarline = filteredScore.parts.length > 1 || lastStaveIdx > 0;
        const lastIsTab = viewConfig ? partHasTab(lastPartIndex, viewConfig) && lastStaveIdx === partStandardStaveCount(filteredScore, lastPartIndex, viewConfig) : false;
        if (needsBarline && firstPartStaves.length > 0 && lastPartStaves.length > 0) {
          // VexFlow stave headroom: 4 line-spacings (40px) above the top staff line
          const STAVE_HEADROOM = 40;
          const topY = firstPartStaves[0].y + STAVE_HEADROOM;
          const bottomY = lastPartStaves[0].y + (lastIsTab ? TAB_STAFF_HEIGHT : config.staffHeight);
          const barlineX = firstPartStaves[0].x;

          renderSystemBarline(ctx, barlineX, topY, bottomY);
        }
      }
    }
  }

  // Draw cross-measure slurs and ties using VexFlow's partial StaveTie
  drawCrossSystemSlursAndTies(ctx, filteredScore, allNoteBoxes, allStaveNotes, measurePositions, systems);

  // Draw selection highlight
  if (selection) {
    drawSelection(rawCtx, selection, measurePositions, config);
  }

  // Draw cursor
  if (cursor) {
    drawCursor(ctx, canvas, score, cursor, measurePositions, config, allNoteBoxes, allHitBoxes, pendingPitch, viewConfig);
  }

  // Draw playback cursor
  if (playbackTick != null && playbackTick >= 0) {
    drawPlaybackCursor(ctx, score, playbackTick, measurePositions, config, allNoteBoxes);
  }

  const contentHeight = totalContentHeight(score, config, tabParts, viewConfig);

  return { noteBoxes: allNoteBoxes, hitBoxes: allHitBoxes, annotationBoxes: allAnnotationBoxes, measurePositions, contentHeight };
}

const VOICE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444"];

function drawCursor(
  ctx: RenderContext,
  canvas: HTMLCanvasElement,
  score: Score,
  cursor: CursorPosition,
  measurePositions: ScoreRenderResult["measurePositions"],
  config: LayoutConfig,
  noteBoxes?: Map<NoteEventId, NoteBox>,
  hitBoxes?: NoteBox[],
  pendingPitch?: { pitchClass: import("../model").PitchClass; octave: import("../model").Octave; accidental: import("../model").Accidental } | null,
  viewConfig?: ViewConfig,
): void {
  const mp = measurePositions.find(
    (p) => p.partIndex === cursor.partIndex && p.measureIndex === cursor.measureIndex && p.staveIndex === (cursor.staveIndex ?? 0)
  );
  if (!mp) return;

  // Use VexFlow's context for coordinates (handles DPR scaling),
  // but reach into the real canvas context to set lineWidth directly
  // (VexFlow's wrapper ignores lineWidth assignments).
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  const canvasCtx = canvas.getContext("2d");
  if (!rawCtx.strokeStyle) return;

  // Compute local voice index within the staff for color
  const cursorMeasure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
  const cursorStave = cursor.staveIndex ?? 0;
  let localVoiceIdx = 0;
  if (cursorMeasure) {
    const staffVoices = cursorMeasure.voices
      .map((v, i) => i)
      .filter((i) => (cursorMeasure.voices[i]?.staff ?? 0) === cursorStave);
    localVoiceIdx = staffVoices.indexOf(cursor.voiceIndex);
    if (localVoiceIdx < 0) localVoiceIdx = 0;
  }
  const cursorColor = VOICE_COLORS[localVoiceIdx] ?? VOICE_COLORS[0];

  // Try to find the actual noteBox at the cursor position, preferring the stave the cursor is on
  let targetBox: NoteBox | undefined;
  {
    const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
    if (voice && cursor.eventIndex < voice.events.length) {
      const eventId = voice.events[cursor.eventIndex].id;
      const staveIdx = cursor.staveIndex ?? 0;
      // First try hitBoxes for a stave-specific match
      if (hitBoxes) {
        targetBox = hitBoxes.find((nb) => nb.id === eventId && nb.staveIndex === staveIdx);
      }
      // Fall back to the noteBoxes map (first stave)
      if (!targetBox && noteBoxes) {
        targetBox = noteBoxes.get(eventId);
      }
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
    cursorX = mp.noteStartX + 10;
    if (voice) {
      const staveIdx = cursor.staveIndex ?? 0;
      for (let i = eventCount - 1; i >= 0; i--) {
        const eid = voice.events[i].id;
        const nb = hitBoxes?.find((b) => b.id === eid && b.staveIndex === staveIdx) ?? noteBoxes?.get(eid);
        if (nb) {
          cursorX = nb.x + nb.width + 10;
          break;
        }
      }
    }
  }

  // VexFlow staves have headroom above the top staff line
  // Standard: 4 * 10px = 40px, Tab: 4 * 13px = 52px
  // Staff lines: standard = 4 gaps * 10px = 40px, tab = 5 gaps * 13px = 65px
  const STAVE_HEADROOM = 40;
  const TAB_HEADROOM = 52;
  const headroom = mp.isTab ? TAB_HEADROOM : STAVE_HEADROOM;
  const lineSpan = mp.isTab ? 65 : 40; // distance from top line to bottom line
  const CURSOR_OVERSHOOT = 20;
  const staffTop = mp.y + headroom - CURSOR_OVERSHOOT;
  const staffBottom = mp.y + headroom + lineSpan;

  rawCtx.save();

  // Draw note highlight rect if on a note
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

  // Draw tab string highlight — shows which string the tab cursor is on
  if (viewConfig && getEffectiveInputMode(viewConfig, cursor.partIndex, useEditorStore.getState().inputState.tabInputActive) === "tab") {
    const { tabString } = useEditorStore.getState().inputState;
    // VexFlow TabStave: spacingBetweenLinesPx=13, spaceAboveStaffLn=4 (inherited)
    // getYForLine(n) = y + n * 13 + 4 * 13 = y + 13n + 52
    const TAB_LINE_SPACING = 13;
    const TAB_HEADROOM = 4; // spaceAboveStaffLn in line-spacings
    const lineIndex = tabString - 1; // string 1→line 0, string 6→line 5
    const lineY = mp.y + lineIndex * TAB_LINE_SPACING + TAB_HEADROOM * TAB_LINE_SPACING;

    // Draw a highlight circle on the string at the cursor position
    rawCtx.setLineDash([]);
    rawCtx.fillStyle = cursorColor;
    rawCtx.globalAlpha = 0.3;
    rawCtx.beginPath();
    rawCtx.arc(cursorX, lineY, 7, 0, Math.PI * 2);
    rawCtx.fill();
    rawCtx.globalAlpha = 1.0;

    // Draw the fret buffer text if any
    const { tabFretBuffer } = useEditorStore.getState().inputState;
    if (tabFretBuffer) {
      rawCtx.fillStyle = cursorColor;
      rawCtx.font = "bold 12px sans-serif";
      rawCtx.textAlign = "center";
      rawCtx.fillText(tabFretBuffer, cursorX, lineY + 4);
      rawCtx.textAlign = "start";
    }
  }

  // Draw shadow notehead for pending pitch (pitch-before-duration mode)
  if (pendingPitch) {
    const measure = score.parts[cursor.partIndex]?.measures[cursor.measureIndex];
    const clefType = measure?.clef?.type ?? "treble";
    const yPos = pitchToStaffY(pendingPitch.pitchClass, pendingPitch.octave, clefType, staffTop, config.staffHeight);
    // Draw ghost notehead via VexFlow's underlying context2D (has 4x DPR transform).
    // Font size 80px matches VexFlow's actual notehead rendering at this scale.
    const ctx2d = (rawCtx as any).context2D as CanvasRenderingContext2D | undefined;
    if (ctx2d) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.45;
      ctx2d.fillStyle = "#3b82f6";  // same blue as cursor
      ctx2d.font = "42px Bravura";
      // SMuFL noteheadBlack = U+E0A4. Offset to center glyph on yPos.
      ctx2d.fillText("\uE0A4", cursorX - 5, yPos);
      ctx2d.restore();
    }

    // Ledger lines if needed — draw through the notehead center
    if (ctx2d) {
      const VEX_SPACING = 10;
      const VEX_HEAD = 4;
      const topLine = staffTop + VEX_HEAD * VEX_SPACING;
      const bottomLine = topLine + 4 * VEX_SPACING;
      const ledgerHalfWidth = 10;
      ctx2d.save();
      ctx2d.globalAlpha = 0.45;
      ctx2d.strokeStyle = cursorColor;
      ctx2d.lineWidth = 1.2;
      // Above staff
      for (let ly = topLine - VEX_SPACING; ly >= yPos - 1; ly -= VEX_SPACING) {
        ctx2d.beginPath();
        ctx2d.moveTo(cursorX - ledgerHalfWidth + 1, ly);
        ctx2d.lineTo(cursorX + ledgerHalfWidth + 1, ly);
        ctx2d.stroke();
      }
      // Below staff
      for (let ly = bottomLine + VEX_SPACING; ly <= yPos + 1; ly += VEX_SPACING) {
        ctx2d.beginPath();
        ctx2d.moveTo(cursorX - ledgerHalfWidth + 1, ly);
        ctx2d.lineTo(cursorX + ledgerHalfWidth + 1, ly);
        ctx2d.stroke();
      }
      ctx2d.restore();
    }
  }

  rawCtx.restore();
}

/** Convert a pitch to a Y position on the staff.
 *  Returns the Y coordinate where the notehead should be placed.
 *  Uses diatonic steps from the clef's reference point. */
function pitchToStaffY(
  pitchClass: import("../model").PitchClass,
  octave: number,
  clefType: string,
  staffTop: number,
  staffHeight: number,
): number {
  // Diatonic step number (C=0, D=1, E=2, F=3, G=4, A=5, B=6)
  const DIATONIC: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const step = DIATONIC[pitchClass] ?? 0;
  const totalSteps = octave * 7 + step;

  // Reference: treble clef bottom line = E4 (step 30), top line = F5 (step 38)
  // Bass clef bottom line = G2 (step 18), top line = A3 (step 26)
  // Alto clef bottom line = D3 (step 22), top line = E4 (step 30)
  // Tenor clef bottom line = B2 (step 20), top line = C4 (step 28)
  const REF_BOTTOM: Record<string, number> = {
    treble: 4 * 7 + 2, // E4 = 30
    bass: 2 * 7 + 4,   // G2 = 18
    alto: 3 * 7 + 1,   // D3 = 22
    tenor: 2 * 7 + 6,  // B2 = 20
  };
  const bottomStep = REF_BOTTOM[clefType] ?? REF_BOTTOM.treble;

  // VexFlow stave: 4 line-spacings of headroom above, then 5 lines spanning 4 spacings.
  // Line spacing = 10px (Tables.STAVE_LINE_DISTANCE). staffHeight includes headroom.
  const VEX_LINE_SPACING = 10;
  const VEX_HEADROOM = 4; // in line-spacings
  const topLineY = staffTop + VEX_HEADROOM * VEX_LINE_SPACING; // line 0 (top)
  const bottomLineY = topLineY + 4 * VEX_LINE_SPACING; // line 4 (bottom)
  const halfLine = VEX_LINE_SPACING / 2; // each diatonic step = half a line spacing

  // Steps above the bottom line → move up from bottomLineY
  const stepsAbove = totalSteps - bottomStep;
  return bottomLineY - stepsAbove * halfLine;
}

function getActiveNoteIds(score: Score, playbackTick: number): Set<NoteEventId> {
  const active = new Set<NoteEventId>();
  const { measureIndex, tickInMeasure } = getMeasureIndexForTick(playbackTick);

  for (const part of score.parts) {
    if (part.muted) continue;
    const measure = part.measures[measureIndex];
    if (!measure) continue;

    for (const voice of measure.voices) {
      let offset = 0;
      for (const evt of voice.events) {
        const evtTicks = durationToTicks(evt.duration);
        if (offset <= tickInMeasure && tickInMeasure < offset + evtTicks) {
          if (evt.kind === "note" || evt.kind === "chord") {
            active.add(evt.id);
          }
        }
        offset += evtTicks;
      }
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

  const { measureIndex: targetMeasureIndex, tickInMeasure } = getMeasureIndexForTick(playbackTick);

  // Find the first visible stave for part 0 at this measure (could be standard, slash, or tab)
  const mp = measurePositions.find(
    (p) => p.partIndex === 0 && p.measureIndex === targetMeasureIndex
  );
  if (!mp) return;

  // Find the last stave for this part/measure to span the full height
  const partStaves = measurePositions.filter(
    (p) => p.partIndex === 0 && p.measureIndex === targetMeasureIndex
  );
  const lastStave = partStaves[partStaves.length - 1];

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
      cursorX = tickXPairs[0]?.x ?? mp.noteStartX;
    }
  } else {
    // Fallback to linear interpolation for empty measures
    const fraction = Math.min(tickInMeasure / measureTicks, 1);
    const noteOffset = mp.noteStartX - mp.x;
    const usableWidth = mp.width - noteOffset;
    cursorX = mp.noteStartX + fraction * usableWidth;
  }

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.strokeStyle !== undefined) {
    rawCtx.save();
    rawCtx.strokeStyle = "#888";
    rawCtx.lineWidth = 3;
    rawCtx.setLineDash([]);
    rawCtx.globalAlpha = 0.7;
    // VexFlow stave headroom: 4 line-spacings (40px) above the top staff line
    const STAVE_HEADROOM = 40;
    const cursorTop = mp.y + STAVE_HEADROOM;
    const cursorBottom = lastStave
      ? lastStave.y + lastStave.height
      : mp.y + mp.height;
    rawCtx.beginPath();
    rawCtx.moveTo(cursorX, cursorTop);
    rawCtx.lineTo(cursorX, cursorBottom);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

function drawSelection(
  rawCtx: CanvasRenderingContext2D,
  selection: Selection,
  measurePositions: ScoreRenderResult["measurePositions"],
  _config: LayoutConfig
): void {
  rawCtx.save();
  rawCtx.fillStyle = "rgba(66, 133, 244, 0.15)";
  for (const mp of measurePositions) {
    if (
      mp.partIndex === selection.partIndex &&
      mp.measureIndex >= selection.measureStart &&
      mp.measureIndex <= selection.measureEnd
    ) {
      rawCtx.fillRect(mp.x, mp.y, mp.width, mp.height);
    }
  }
  rawCtx.restore();
}

/**
 * Get the list of visible part indices based on view config.
 */
function getVisiblePartIndices(score: Score, viewConfig?: ViewConfig): number[] {
  const hiddenParts = useEditorStore.getState().hiddenParts;
  let indices: number[];
  if (!viewConfig || viewConfig.partsToShow === "all") {
    indices = score.parts.map((_, i) => i);
  } else {
    indices = viewConfig.partsToShow.filter((i) => i < score.parts.length);
  }
  return indices.filter((i) => !hiddenParts.has(i));
}

/**
 * Build a filtered score containing only the visible parts.
 * Merges score-level data (annotations, navigation, barlines) from hidden parts
 * onto the first visible part so they still render.
 */
const SCORE_LEVEL_ANNOTATION_KINDS = new Set(["rehearsal-mark", "tempo-mark"]);

function filterScoreParts(score: Score, visiblePartIndices: number[]): Score {
  if (visiblePartIndices.length === score.parts.length) {
    return score;
  }
  const visibleSet = new Set(visiblePartIndices);
  // Deep clone the first visible part so we can safely merge onto it
  const firstVisiblePart = structuredClone(score.parts[visiblePartIndices[0]]);
  const otherVisibleParts = visiblePartIndices.slice(1).map((i) => score.parts[i]);

  // Merge score-level data from hidden parts onto the first visible part
  for (let pi = 0; pi < score.parts.length; pi++) {
    if (visibleSet.has(pi)) continue;
    const hiddenPart = score.parts[pi];
    for (let mi = 0; mi < hiddenPart.measures.length && mi < firstVisiblePart.measures.length; mi++) {
      const src = hiddenPart.measures[mi];
      const dst = firstVisiblePart.measures[mi];

      // Merge annotations (rehearsal marks, tempo marks, chord symbols)
      for (const ann of src.annotations) {
        if (!SCORE_LEVEL_ANNOTATION_KINDS.has(ann.kind)) continue;
        const isDup = dst.annotations.some(a => a.kind === ann.kind &&
          ("text" in a && "text" in ann ? (a as any).text === (ann as any).text : true));
        if (!isDup) dst.annotations.push(ann);
      }

      // Merge navigation marks (volta, coda, segno, D.S., D.C., Fine)
      if (src.navigation && !dst.navigation) {
        dst.navigation = { ...src.navigation };
      } else if (src.navigation && dst.navigation) {
        if (src.navigation.volta && !dst.navigation.volta) dst.navigation.volta = src.navigation.volta;
        if (src.navigation.coda && !dst.navigation.coda) dst.navigation.coda = true;
        if (src.navigation.segno && !dst.navigation.segno) dst.navigation.segno = true;
        if (src.navigation.toCoda && !dst.navigation.toCoda) dst.navigation.toCoda = true;
        if (src.navigation.fine && !dst.navigation.fine) dst.navigation.fine = true;
        if (src.navigation.dsText && !dst.navigation.dsText) dst.navigation.dsText = src.navigation.dsText;
        if (src.navigation.dcText && !dst.navigation.dcText) dst.navigation.dcText = src.navigation.dcText;
      }

      // Merge barline type (prefer non-single)
      if (src.barlineEnd !== "single" && dst.barlineEnd === "single") {
        dst.barlineEnd = src.barlineEnd;
      }
    }
  }

  return {
    ...score,
    parts: [firstVisiblePart, ...otherVisibleParts],
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
 * Draw cross-measure slurs and ties using VexFlow's StaveTie with partial note support.
 * Same-system cross-measure: StaveTie with both firstNote and lastNote.
 * Cross-system: two partial StaveTies — one with firstNote only, one with lastNote only.
 */
function drawCrossSystemSlursAndTies(
  ctx: RenderContext,
  score: Score,
  noteBoxes: Map<NoteEventId, NoteBox>,
  staveNotes: Map<NoteEventId, StaveNote>,
  measurePositions: ScoreRenderResult["measurePositions"],
  systems: SystemLine[],
): void {
  function systemForMeasure(mi: number): SystemLine | undefined {
    return systems.find((s) => mi >= s.startMeasure && mi < s.endMeasure);
  }

  function drawTie(firstNote: StaveNote | null, lastNote: StaveNote | null, firstIndexes?: number[], lastIndexes?: number[]) {
    try {
      new StaveTie({
        firstNote: firstNote ?? undefined,
        lastNote: lastNote ?? undefined,
        firstIndexes,
        lastIndexes,
      }).setContext(ctx.context).draw();
    } catch { /* VexFlow may reject partial ties in edge cases */ }
  }

  // Cross-measure slurs
  for (const part of score.parts) {
    for (let mi = 0; mi < part.measures.length; mi++) {
      const measure = part.measures[mi];
      for (const ann of measure.annotations) {
        if (ann.kind !== "slur") continue;

        const startSN = staveNotes.get(ann.startEventId);
        const endSN = staveNotes.get(ann.endEventId);
        const startBox = noteBoxes.get(ann.startEventId);
        const endBox = noteBoxes.get(ann.endEventId);
        if (!startBox || !endBox) continue;

        // Skip same-measure — already rendered by vexBridge
        if (startBox.measureIndex === endBox.measureIndex) continue;

        const startSys = systemForMeasure(startBox.measureIndex);
        const endSys = systemForMeasure(endBox.measureIndex);
        if (!startSys || !endSys) continue;

        if (startSys.lineIndex === endSys.lineIndex) {
          // Same system, cross-measure — direct tie
          if (startSN && endSN) drawTie(startSN, endSN);
        } else {
          // Cross-system — two partial ties
          if (startSN) drawTie(startSN, null);
          if (endSN) drawTie(null, endSN);
        }
      }

      // Cross-measure ties: last event with tied flag → first event of next measure
      for (let vi = 0; vi < measure.voices.length; vi++) {
        const voice = measure.voices[vi];
        const lastEvent = voice.events[voice.events.length - 1];
        if (!lastEvent) continue;

        const nextMeasure = part.measures[mi + 1];
        if (!nextMeasure) continue;
        const nextVoice = nextMeasure.voices[vi];
        if (!nextVoice || nextVoice.events.length === 0) continue;
        const nextEvent = nextVoice.events[0];

        const startSN = staveNotes.get(lastEvent.id);
        const endSN = staveNotes.get(nextEvent.id);

        if (lastEvent.kind === "note" && lastEvent.head.tied) {
          const startSys = systemForMeasure(mi);
          const endSys = systemForMeasure(mi + 1);
          if (!startSys || !endSys) continue;

          if (startSys.lineIndex === endSys.lineIndex) {
            if (startSN && endSN) drawTie(startSN, endSN);
          } else {
            if (startSN) drawTie(startSN, null);
            if (endSN) drawTie(null, endSN);
          }
        } else if (lastEvent.kind === "chord") {
          const tiedIndexes = lastEvent.heads
            .map((h, idx) => (h.tied ? idx : -1))
            .filter((idx) => idx >= 0);
          if (tiedIndexes.length === 0) continue;

          const startSys = systemForMeasure(mi);
          const endSys = systemForMeasure(mi + 1);
          if (!startSys || !endSys) continue;

          for (const headIdx of tiedIndexes) {
            if (startSys.lineIndex === endSys.lineIndex) {
              if (startSN && endSN) drawTie(startSN, endSN, [headIdx], [headIdx]);
            } else {
              if (startSN) drawTie(startSN, null, [headIdx], [headIdx]);
              if (endSN) drawTie(null, endSN, [headIdx], [headIdx]);
            }
          }
        }
      }
    }
  }
}

export { MEASURE_WIDTH, STAFF_HEIGHT, LEFT_MARGIN, TOP_MARGIN, MEASURES_PER_LINE };
