import { useRef, useEffect, useCallback } from "react";
import { useEditorStore } from "../state";
import { initRenderer, type RenderContext } from "../renderer";
import { renderScore, calculateContentHeight } from "../renderer";

export function ScoreCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<RenderContext | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const score = useEditorStore((s) => s.score);
  const inputState = useEditorStore((s) => s.inputState);
  const setNoteBoxes = useEditorStore((s) => s.setNoteBoxes);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = container.clientWidth;
    const contentHeight = calculateContentHeight(score);
    const canvasHeight = Math.max(contentHeight, container.clientHeight);

    canvas.width = containerWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    ctxRef.current = initRenderer(canvas);
    const ctx = ctxRef.current.context as unknown as CanvasRenderingContext2D;
    if (ctx.scale) {
      ctx.scale(dpr, dpr);
    }
  }, [score]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;

    const result = renderScore(ctxRef.current, canvas, score, inputState.cursor);
    setNoteBoxes(result.noteBoxes);
  }, [score, inputState.cursor, setNoteBoxes]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: "auto", background: "#fff" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block" }}
      />
    </div>
  );
}
