import type { Score, NoteEventId } from "../model";
import { renderMeasure, clearCanvas, type RenderContext, type NoteBox } from "./vexBridge";
import type { CursorPosition } from "../input/InputState";

export interface ScoreRenderResult {
  noteBoxes: Map<NoteEventId, NoteBox>;
  measurePositions: { partIndex: number; measureIndex: number; x: number; y: number; width: number }[];
  contentHeight: number;
}

const MEASURE_WIDTH = 250;
const STAFF_HEIGHT = 120;
const LEFT_MARGIN = 20;
const TOP_MARGIN = 40;
const MEASURES_PER_LINE = 4;
const BOTTOM_MARGIN = 60;

export function calculateContentHeight(score: Score): number {
  let maxLine = 0;
  for (let pi = 0; pi < score.parts.length; pi++) {
    const part = score.parts[pi];
    const lines = Math.ceil(part.measures.length / MEASURES_PER_LINE);
    const totalLines = lines * score.parts.length;
    maxLine = Math.max(maxLine, totalLines);
  }
  return TOP_MARGIN + maxLine * STAFF_HEIGHT + BOTTOM_MARGIN;
}

export function renderScore(
  ctx: RenderContext,
  canvas: HTMLCanvasElement,
  score: Score,
  cursor?: CursorPosition
): ScoreRenderResult {
  clearCanvas(ctx, canvas);

  const allNoteBoxes = new Map<NoteEventId, NoteBox>();
  const measurePositions: ScoreRenderResult["measurePositions"] = [];

  for (let pi = 0; pi < score.parts.length; pi++) {
    const part = score.parts[pi];

    for (let mi = 0; mi < part.measures.length; mi++) {
      const m = part.measures[mi];
      const lineIndex = Math.floor(mi / MEASURES_PER_LINE);
      const posInLine = mi % MEASURES_PER_LINE;

      const x = LEFT_MARGIN + posInLine * MEASURE_WIDTH;
      const y = TOP_MARGIN + (pi + lineIndex * score.parts.length) * STAFF_HEIGHT;

      const isFirstInLine = posInLine === 0;

      const result = renderMeasure(
        ctx,
        m,
        x,
        y,
        MEASURE_WIDTH,
        isFirstInLine,
        mi === 0,
        isFirstInLine
      );

      measurePositions.push({ partIndex: pi, measureIndex: mi, x, y, width: MEASURE_WIDTH });

      for (const nb of result.noteBoxes) {
        allNoteBoxes.set(nb.id, nb);
      }
    }
  }

  // Draw cursor
  if (cursor) {
    drawCursor(ctx, score, cursor, measurePositions);
  }

  const contentHeight = calculateContentHeight(score);

  return { noteBoxes: allNoteBoxes, measurePositions, contentHeight };
}

function drawCursor(
  ctx: RenderContext,
  score: Score,
  cursor: CursorPosition,
  measurePositions: ScoreRenderResult["measurePositions"]
): void {
  const mp = measurePositions.find(
    (p) => p.partIndex === cursor.partIndex && p.measureIndex === cursor.measureIndex
  );
  if (!mp) return;

  const voice = score.parts[cursor.partIndex]?.measures[cursor.measureIndex]?.voices[cursor.voiceIndex];
  if (!voice) return;

  // Simple cursor: vertical line at event position
  const eventCount = voice.events.length;
  const usableWidth = mp.width - 60; // account for clef/key/time sig space
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
    rawCtx.lineTo(cursorX, mp.y + STAFF_HEIGHT - 20);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

export { MEASURE_WIDTH, STAFF_HEIGHT, LEFT_MARGIN, TOP_MARGIN, MEASURES_PER_LINE };
