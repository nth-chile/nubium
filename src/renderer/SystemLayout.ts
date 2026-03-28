import type { Score } from "../model/score";
import type { Stylesheet } from "../model/stylesheet";
import { resolveStylesheet } from "../model/stylesheet";
import { getInstrument } from "../model/instruments";
import { calculateMeasureWidth } from "./measureWidth";

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
}

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
};

/**
 * Returns the number of staves a part occupies.
 */
export function partStaveCount(score: Score, partIndex: number): number {
  const part = score.parts[partIndex];
  if (!part) return 1;
  const instrument = getInstrument(part.instrumentId);
  return instrument?.staves ?? 1;
}

/**
 * Calculate the vertical height needed for one system line (all parts).
 */
export function systemHeight(score: Score, config: LayoutConfig): number {
  let h = 0;
  for (let pi = 0; pi < score.parts.length; pi++) {
    const staves = partStaveCount(score, pi);
    h += config.staffHeight * staves;
    if (staves === 2) {
      h += config.grandStaffSpacing;
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
      const w = calculateMeasureWidth(m, {
        showClef: isFirstInLine,
        showTimeSig: mi === 0,
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
  config: LayoutConfig = DEFAULT_LAYOUT
): SystemLine[] {
  if (score.parts.length === 0) return [];

  const measureCount = score.parts[0].measures.length;
  const sysHeight = systemHeight(score, config);

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

  for (let li = 0; li < lineBreaks.length; li++) {
    const { start: startMeasure, end: endMeasure, widths: rawWidths } = lineBreaks[li];
    const isFirstSystem = li === 0;

    const lineY = config.topMargin + li * (sysHeight + config.staffSpacing);
    const labelOffset = isFirstSystem ? config.partLabelWidth : 0;

    // Distribute remaining space proportionally for adaptive mode
    const lineAvailable = totalAvailableWidth - labelOffset;
    const finalWidths = useAdaptive
      ? distributeLineSpace(rawWidths, lineAvailable)
      : rawWidths;

    const staves: StaveLayout[] = [];
    let yOffset = lineY;

    for (let pi = 0; pi < score.parts.length; pi++) {
      const staveCount = partStaveCount(score, pi);

      for (let si = 0; si < staveCount; si++) {
        let xCursor = config.leftMargin + labelOffset;
        for (let idx = 0; idx < finalWidths.length; idx++) {
          const w = finalWidths[idx];
          staves.push({
            partIndex: pi,
            staveIndex: si,
            x: xCursor,
            y: yOffset,
            width: w,
          });
          xCursor += w;
        }

        yOffset += config.staffHeight;
        if (si === 0 && staveCount === 2) {
          yOffset += config.grandStaffSpacing;
        }
      }

      if (pi < score.parts.length - 1) {
        yOffset += config.staffSpacing;
      }
    }

    systems.push({
      lineIndex: li,
      startMeasure,
      endMeasure,
      staves,
      y: lineY,
      height: yOffset - lineY,
    });
  }

  return systems;
}

/**
 * Total content height for the rendered score.
 */
export function totalContentHeight(
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT
): number {
  if (score.parts.length === 0) return config.topMargin + config.bottomMargin;

  // Use computeLayout to determine the actual number of lines for adaptive mode
  const systems = computeLayout(score, config);
  const lineCount = systems.length;
  const sysHeight = systemHeight(score, config);
  return (
    config.topMargin +
    lineCount * sysHeight +
    (lineCount > 0 ? (lineCount - 1) * config.staffSpacing : 0) +
    config.bottomMargin
  );
}
