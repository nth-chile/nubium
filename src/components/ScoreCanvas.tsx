import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "../state";
import { initRenderer } from "../renderer";
import { renderScore, calculateContentHeight } from "../renderer";
import { ScoreOverlay } from "./ScoreOverlay";
import { AnnotationPopover } from "./DynamicsPopover";

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
  const showTitle = useEditorStore((s) => s.showTitle);
  const showComposer = useEditorStore((s) => s.showComposer);
  const showLyrics = useEditorStore((s) => s.showLyrics);
  const editingTitle = useEditorStore((s) => s.editingTitle);
  const editingComposer = useEditorStore((s) => s.editingComposer);
  const measurePositions = useEditorStore((s) => s.measurePositions);

  // Auto-scroll to keep cursor visible
  useEffect(() => {
    const container = containerRef.current;
    if (!container || measurePositions.length === 0) return;
    const mp = measurePositions.find(
      (p) => p.partIndex === inputState.cursor.partIndex && p.measureIndex === inputState.cursor.measureIndex,
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
  }, [inputState.cursor.partIndex, inputState.cursor.measureIndex, measurePositions]);

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
    const contentHeight = calculateContentHeight(score, viewConfig, width);
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

    const result = renderScore(ctx, canvas, score, inputState.cursor, playbackTick, viewConfig, width, selection);

    // Draw note-level selection highlights
    if (noteSelection) {
      const voice = score.parts[noteSelection.partIndex]?.measures[noteSelection.measureIndex]?.voices[noteSelection.voiceIndex];
      if (voice) {
        rawCtx.save();
        rawCtx.fillStyle = "#3b82f6";
        rawCtx.globalAlpha = 0.2;
        const pad = 3;
        for (let i = noteSelection.startEvent; i <= noteSelection.endEvent && i < voice.events.length; i++) {
          const box = result.noteBoxes.get(voice.events[i].id);
          if (box) {
            const bx = box.headX - pad, by = box.headY - pad, bw = box.headWidth + pad * 2, bh = box.headHeight + pad * 2;
            rawCtx.beginPath();
            if (rawCtx.roundRect) {
              rawCtx.roundRect(bx, by, bw, bh, 4);
            } else {
              rawCtx.rect(bx, by, bw, bh);
            }
            rawCtx.fill();
          }
        }
        rawCtx.restore();
      }
    }

    setNoteBoxes(result.noteBoxes);
    setAnnotationBoxes(result.annotationBoxes);
    setMeasurePositions(result.measurePositions);
  }, [score, inputState.cursor, playbackTick, viewConfig, containerWidth, selection, noteSelection, showTitle, showComposer, showLyrics, editingTitle, editingComposer, setNoteBoxes, setAnnotationBoxes, setMeasurePositions]);

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
