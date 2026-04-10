import type { Score } from "../model/score";
import type { Stylesheet } from "../model/stylesheet";
import { getInstrument } from "../model/instruments";
import { calculateMeasureWidth } from "./measureWidth";
import { getPartDisplay, type ViewConfig } from "../views/ViewMode";

export interface StaveLayout {
  partIndex: number;
  staveIndex: number; // 0 for single-staff, 0/1 for grand staff
  x: number;
  y: number;
  width: number;
}

export interface SystemLine {
  lineIndex: number;
  startMeasure: number;
  endMeasure: number; // exclusive
  staves: StaveLayout[];
  y: number;
  height: number;
  /** Page number (0-based). Only meaningful when pageBreaks is true. */
  page: number;
}

export interface LayoutConfig {
  measureWidth: number;
  measuresPerLine: number;
  leftMargin: number;
  topMargin: number;
  staffHeight: number;
  staffSpacing: number; // vertical space between staves of different parts
  grandStaffSpacing: number; // vertical space between staves of a grand staff
  partLabelWidth: number; // extra width for part name on first system
  bottomMargin: number;
  /** When true, use adaptive measure widths and greedy line-breaking */
  adaptiveWidths: boolean;
  /** Available width for the score (canvas/viewport width). Used with adaptiveWidths. */
  availableWidth: number;
  /** Stylesheet for adaptive width calculation */
  stylesheet?: Partial<Stylesheet>;
  /** When true, insert page breaks so systems don't overflow pages */
  pageBreaks: boolean;
  /** Page width in CSS pixels (default: 816 = 8.5in at 96dpi) */
  pageWidth: number;
  /** Page height in CSS pixels (default: 1056 = 11in at 96dpi) */
  pageHeight: number;
}

/** VexFlow TabStave: 6 lines, 13px spacing, 4 spacings headroom → bottom line at y+117 */
export const TAB_STAFF_HEIGHT = 117;

export const DEFAULT_LAYOUT: LayoutConfig = {
  measureWidth: 250,
  measuresPerLine: 4,
  leftMargin: 20,
  topMargin: 40,
  staffHeight: 80, // height of one stave (VexFlow stave)
  staffSpacing: 80, // gap between last stave of one part and first of next
  grandStaffSpacing: 40, // gap between treble and bass of grand staff
  partLabelWidth: 60, // extra offset for part names
  bottomMargin: 60,
  adaptiveWidths: false,
  availableWidth: 1000,
  pageBreaks: false,
  pageWidth: 816, // 8.5in at 96dpi
  pageHeight: 1056, // 11in at 96dpi
};

/**
 * Returns the number of standard (non-tab) staves for a part.
 */
export function partStandardStaveCount(score: Score, partIndex: number, viewConfig?: ViewConfig): number {
  const display = viewConfig ? getPartDisplay(viewConfig, partIndex) : { standard: true, tab: false, slash: false };
  if (!display.standard) return 0;
  const part = score.parts[partIndex];
  if (!part) return 1;
  const instrument = getInstrument(part.instrumentId);
  return instrument?.staves ?? 1;
}

/** Whether a part has a separate slash stave */
export function partHasSlash(partIndex: number, viewConfig?: ViewConfig): boolean {
  if (!viewConfig) return false;
  return getPartDisplay(viewConfig, partIndex).slash;
}

/**
 * Returns whether a part has a tab stave.
 */
export function partHasTab(partIndex: number, viewConfig?: ViewConfig): boolean {
  if (!viewConfig) return false;
  return getPartDisplay(viewConfig, partIndex).tab;
}

/**
 * Returns the number of staves a part occupies (standard + tab combined).
 * @deprecated Use partStandardStaveCount + partHasTab for clarity. Kept for layout compat.
 */
export function partStaveCount(score: Score, partIndex: number, tabParts?: Set<number>, viewConfig?: ViewConfig): number {
  if (viewConfig) {
    return partStandardStaveCount(score, partIndex, viewConfig)
      + (partHasSlash(partIndex, viewConfig) ? 1 : 0)
      + (partHasTab(partIndex, viewConfig) ? 1 : 0);
  }
  // Legacy path: tabParts means tab-only
  if (tabParts?.has(partIndex)) return 1;
  const part = score.parts[partIndex];
  if (!part) return 1;
  const instrument = getInstrument(part.instrumentId);
  return instrument?.staves ?? 1;
}

/**
 * Calculate the vertical height needed for one system line (all parts).
 */
export function systemHeight(score: Score, config: LayoutConfig, tabParts?: Set<number>, viewConfig?: ViewConfig): number {
  let h = 0;
  for (let pi = 0; pi < score.parts.length; pi++) {
    const standardStaves = viewConfig ? partStandardStaveCount(score, pi, viewConfig) : (tabParts?.has(pi) ? 0 : (() => { const p = score.parts[pi]; const inst = p ? getInstrument(p.instrumentId) : undefined; return inst?.staves ?? 1; })());
    const hasSlash = viewConfig ? partHasSlash(pi, viewConfig) : false;
    const hasTab = viewConfig ? partHasTab(pi, viewConfig) : (tabParts?.has(pi) ?? false);
    let prevStaves = standardStaves;

    // Standard staves
    h += config.staffHeight * standardStaves;
    if (standardStaves === 2) {
      h += config.grandStaffSpacing;
    }

    // Slash stave (always single standard-height staff)
    if (hasSlash) {
      if (prevStaves > 0) h += config.grandStaffSpacing;
      h += config.staffHeight;
      prevStaves++;
    }

    // Tab stave
    if (hasTab) {
      if (prevStaves > 0) h += config.grandStaffSpacing;
      h += TAB_STAFF_HEIGHT;
    }

    if (pi < score.parts.length - 1) {
      h += config.staffSpacing;
    }
  }
  return h;
}

/**
 * Break measures into lines greedily based on their adaptive widths.
 * Returns an array of { start, end } ranges (end exclusive).
 */
function breakMeasuresIntoLines(
  score: Score,
  config: LayoutConfig,
  totalAvailableWidth: number
): { start: number; end: number; widths: number[] }[] {
  const part = score.parts[0];
  if (!part) return [];

  const measureCount = part.measures.length;
  const lines: { start: number; end: number; widths: number[] }[] = [];
  let mi = 0;

  while (mi < measureCount) {
    const isFirstSystem = lines.length === 0;
    const labelOffset = isFirstSystem ? config.partLabelWidth : 0;
    const lineAvailable = totalAvailableWidth - labelOffset;

    let lineWidth = 0;
    const lineStart = mi;
    const lineWidths: number[] = [];

    while (mi < measureCount) {
      const m = part.measures[mi];
      const isFirstInLine = mi === lineStart;
      // Pickup measures don't show time sig — it goes on the next measure
      const prevMeasure = mi > 0 ? part.measures[mi - 1] : undefined;
      const showTimeSig = m.isPickup ? false : (mi === 0 || !!prevMeasure?.isPickup);
      const w = calculateMeasureWidth(m, {
        showClef: isFirstInLine,
        showTimeSig,
        showKeySig: isFirstInLine,
        stylesheet: config.stylesheet,
      });

      if (!isFirstInLine && lineWidth + w > lineAvailable) {
        break;
      }

      lineWidths.push(w);
      lineWidth += w;
      mi++;
    }

    lines.push({ start: lineStart, end: mi, widths: lineWidths });
  }

  return lines;
}

/**
 * Distribute remaining space proportionally across measures in a line.
 */
function distributeLineSpace(widths: number[], availableWidth: number): number[] {
  const totalWidth = widths.reduce((s, w) => s + w, 0);
  const remaining = availableWidth - totalWidth;
  if (remaining <= 0 || totalWidth === 0) return widths;

  return widths.map((w) => w + (w / totalWidth) * remaining);
}

/**
 * Compute the full system layout for the score.
 */
export function computeLayout(
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT,
  tabParts?: Set<number>,
  viewConfig?: ViewConfig
): SystemLine[] {
  if (score.parts.length === 0) return [];

  const measureCount = score.parts[0].measures.length;
  const sysHeight = systemHeight(score, config, tabParts, viewConfig);

  // Determine line breaks
  const useAdaptive = config.adaptiveWidths && score.parts.length > 0;

  const rightMargin = 20;
  const totalAvailableWidth = useAdaptive
    ? config.availableWidth - config.leftMargin - rightMargin
    : config.measuresPerLine * config.measureWidth;

  const lineBreaks: { start: number; end: number; widths: number[] }[] = useAdaptive
    ? breakMeasuresIntoLines(score, config, totalAvailableWidth)
    : (() => {
        // Fixed layout: use measuresPerLine
        const lines: { start: number; end: number; widths: number[] }[] = [];
        const lineCount = Math.ceil(measureCount / config.measuresPerLine);
        for (let li = 0; li < lineCount; li++) {
          const start = li * config.measuresPerLine;
          const end = Math.min(start + config.measuresPerLine, measureCount);
          const count = end - start;
          const isFirstSystem = li === 0;
          const labelOffset = isFirstSystem ? config.partLabelWidth : 0;
          const availWidth = totalAvailableWidth - labelOffset;
          const mw = availWidth / count;
          lines.push({ start, end, widths: Array(count).fill(mw) });
        }
        return lines;
      })();

  const systems: SystemLine[] = [];
  const usePages = config.pageBreaks;
  let currentPage = 0;
  // Track y position within the current page (relative to page top)
  let pageY = config.topMargin;
  // Track the absolute y position across all pages
  let absoluteY = config.topMargin;
  const pageContentHeight = usePages ? config.pageHeight - config.bottomMargin : Infinity;

  for (let li = 0; li < lineBreaks.length; li++) {
    const { start: startMeasure, end: endMeasure, widths: rawWidths } = lineBreaks[li];
    const isFirstSystem = li === 0;

    const systemH = sysHeight;

    // Page break logic: if this system would overflow, move to next page
    if (usePages && li > 0 && pageY + systemH > pageContentHeight) {
      currentPage++;
      pageY = config.topMargin;
      absoluteY = currentPage * config.pageHeight + config.topMargin;
    }

    const lineY = absoluteY;
    const labelOffset = isFirstSystem ? config.partLabelWidth : 0;

    // Distribute remaining space proportionally for adaptive mode
    const lineAvailable = totalAvailableWidth - labelOffset;
    const finalWidths = useAdaptive
      ? distributeLineSpace(rawWidths, lineAvailable)
      : rawWidths;

    const staves: StaveLayout[] = [];
    let yOffset = lineY;

    for (let pi = 0; pi < score.parts.length; pi++) {
      const standardStaves = viewConfig ? partStandardStaveCount(score, pi, viewConfig) : (tabParts?.has(pi) ? 0 : (() => { const p = score.parts[pi]; const inst = p ? getInstrument(p.instrumentId) : undefined; return inst?.staves ?? 1; })());
      const hasSlash = viewConfig ? partHasSlash(pi, viewConfig) : false;
      const hasTab = viewConfig ? partHasTab(pi, viewConfig) : (tabParts?.has(pi) ?? false);
      let nextSi = 0;

      // Standard staves
      for (let si = 0; si < standardStaves; si++) {
        let xCursor = config.leftMargin + labelOffset;
        for (let idx = 0; idx < finalWidths.length; idx++) {
          staves.push({ partIndex: pi, staveIndex: nextSi, x: xCursor, y: yOffset, width: finalWidths[idx] });
          xCursor += finalWidths[idx];
        }
        nextSi++;
        yOffset += config.staffHeight;
        if (si === 0 && standardStaves === 2) {
          yOffset += config.grandStaffSpacing;
        }
      }

      // Slash stave (separate staff, standard height)
      if (hasSlash) {
        if (nextSi > 0) yOffset += config.grandStaffSpacing;
        let xCursor = config.leftMargin + labelOffset;
        for (let idx = 0; idx < finalWidths.length; idx++) {
          staves.push({ partIndex: pi, staveIndex: nextSi, x: xCursor, y: yOffset, width: finalWidths[idx] });
          xCursor += finalWidths[idx];
        }
        nextSi++;
        yOffset += config.staffHeight;
      }

      // Tab stave
      if (hasTab) {
        if (nextSi > 0) yOffset += config.grandStaffSpacing;
        let xCursor = config.leftMargin + labelOffset;
        for (let idx = 0; idx < finalWidths.length; idx++) {
          staves.push({ partIndex: pi, staveIndex: nextSi, x: xCursor, y: yOffset, width: finalWidths[idx] });
          xCursor += finalWidths[idx];
        }
        nextSi++;
        yOffset += TAB_STAFF_HEIGHT;
      }

      if (pi < score.parts.length - 1) {
        yOffset += config.staffSpacing;
      }
    }

    // Calculate extra space needed for below-staff annotations (dynamics, hairpins, lyrics)
    let belowStaffExtra = 0;
    const lastPart = score.parts[score.parts.length - 1];
    if (lastPart) {
      for (let mi = startMeasure; mi < endMeasure; mi++) {
        const measure = lastPart.measures[mi];
        if (!measure) continue;
        let needed = 0;
        const hasDynamic = measure.annotations.some((a) => a.kind === "dynamic");
        const hasHairpin = measure.annotations.some((a) => a.kind === "hairpin");
        const hasLyric = measure.annotations.some((a) => a.kind === "lyric");
        if (hasDynamic) needed += 20;
        if (hasHairpin) needed += 14;
        if (hasLyric) {
          const maxVerse = Math.max(...measure.annotations
            .filter((a) => a.kind === "lyric")
            .map((a) => a.kind === "lyric" ? (a.verseNumber || 1) : 0), 1);
          needed += 18 + (maxVerse - 1) * 18;
        }
        belowStaffExtra = Math.max(belowStaffExtra, needed);
      }
    }

    const systemHeight = yOffset - lineY;
    const systemSpacing = config.staffSpacing + belowStaffExtra;
    pageY += systemHeight + systemSpacing;
    absoluteY += systemHeight + systemSpacing;

    systems.push({
      lineIndex: li,
      startMeasure,
      endMeasure,
      staves,
      y: lineY,
      height: systemHeight,
      page: currentPage,
    });
  }

  return systems;
}

/**
 * Total content height for the rendered score.
 */
export function totalContentHeight(
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT,
  tabParts?: Set<number>,
  viewConfig?: ViewConfig
): number {
  if (score.parts.length === 0) return config.topMargin + config.bottomMargin;

  const systems = computeLayout(score, config, tabParts, viewConfig);

  if (config.pageBreaks && systems.length > 0) {
    const totalPages = systems[systems.length - 1].page + 1;
    return totalPages * config.pageHeight;
  }

  if (systems.length === 0) return config.topMargin + config.bottomMargin;

  // Use actual system positions from computeLayout for accurate height
  const lastSystem = systems[systems.length - 1];
  return lastSystem.y + lastSystem.height + config.staffSpacing + config.bottomMargin;
}

/**
 * Return the total number of pages when page breaks are enabled.
 */
export function totalPageCount(
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT,
  tabParts?: Set<number>,
  viewConfig?: ViewConfig
): number {
  if (!config.pageBreaks) return 1;
  const systems = computeLayout(score, config, tabParts, viewConfig);
  if (systems.length === 0) return 1;
  return systems[systems.length - 1].page + 1;
}
