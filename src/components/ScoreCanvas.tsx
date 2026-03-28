import { useRef, useEffect, useState } from "react";
import { useEditorStore } from "../state";
import { initRenderer } from "../renderer";
import { renderScore, calculateContentHeight } from "../renderer";

export function ScoreCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);

  const score = useEditorStore((s) => s.score);
  const inputState = useEditorStore((s) => s.inputState);
  const setNoteBoxes = useEditorStore((s) => s.setNoteBoxes);
  const playbackTick = useEditorStore((s) => s.playbackTick);
  const viewConfig = useEditorStore((s) => s.viewConfig);

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

    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.scale) rawCtx.scale(dpr, dpr);

    const result = renderScore(ctx, canvas, score, inputState.cursor, playbackTick, viewConfig, width);
    setNoteBoxes(result.noteBoxes);
  }, [score, inputState.cursor, playbackTick, viewConfig, containerWidth, setNoteBoxes]);

  return (
    <div
      ref={containerRef}
      data-score-container=""
      style={{ flex: 1, overflow: "auto", background: "#fff", minWidth: 0 }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
}
