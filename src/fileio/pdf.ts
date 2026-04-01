import type { Score } from "../model/score";
import { initRenderer } from "../renderer/vexBridge";
import { renderScore } from "../renderer/ScoreRenderer";
import { totalPageCount, DEFAULT_LAYOUT, type LayoutConfig } from "../renderer/SystemLayout";
import { fullScoreConfig, type ViewConfig } from "../views/ViewMode";
import { jsPDF } from "jspdf";

/** Scale factor for print resolution (300dpi / 96dpi) */
const PRINT_SCALE = 300 / 96;

export type PageSize = "letter" | "a4" | "legal" | "tabloid";
export type PageOrientation = "portrait" | "landscape";

export interface PDFExportOptions {
  pageSize?: PageSize;
  orientation?: PageOrientation;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
}

/** Page dimensions in CSS pixels at 96dpi */
const PAGE_SIZES: Record<PageSize, { width: number; height: number; inWidth: number; inHeight: number }> = {
  letter:  { width: 816, height: 1056, inWidth: 8.5,  inHeight: 11 },
  a4:      { width: 794, height: 1123, inWidth: 8.27, inHeight: 11.69 },
  legal:   { width: 816, height: 1344, inWidth: 8.5,  inHeight: 14 },
  tabloid: { width: 1056, height: 1632, inWidth: 11,  inHeight: 17 },
};

/**
 * Export the score as a multi-page PDF and trigger a browser download.
 * When a viewConfig is provided, it is used to filter which parts are rendered.
 */
export async function exportPDF(score: Score, viewConfig?: ViewConfig, options?: PDFExportOptions): Promise<void> {
  const baseConfig = viewConfig ?? fullScoreConfig();
  const size = PAGE_SIZES[options?.pageSize ?? "letter"];
  const isLandscape = (options?.orientation ?? "portrait") === "landscape";
  const pageWidth = isLandscape ? size.height : size.width;
  const pageHeight = isLandscape ? size.width : size.height;
  const inWidth = isLandscape ? size.inHeight : size.inWidth;
  const inHeight = isLandscape ? size.inWidth : size.inHeight;

  const viewCfg: ViewConfig = {
    ...baseConfig,
    layoutConfig: {
      ...baseConfig.layoutConfig,
      pageLayout: true,
      pageWidth,
      pageHeight,
      ...(options?.marginTop != null ? { topMargin: options.marginTop } : {}),
      ...(options?.marginBottom != null ? { bottomMargin: options.marginBottom } : {}),
      ...(options?.marginLeft != null ? { leftMargin: options.marginLeft } : {}),
    },
  };

  // Build a LayoutConfig for page count calculation (must match what renderScore uses)
  const hasTitle = !!score.title;
  const hasComposer = !!score.composer;
  const titleExtra = (hasTitle ? 48 : 0) + (hasComposer ? 22 : 0) + (hasTitle || hasComposer ? 16 : 0);

  const layoutConfig: LayoutConfig = {
    ...DEFAULT_LAYOUT,
    adaptiveWidths: true,
    availableWidth: pageWidth,
    pageBreaks: true,
    pageWidth,
    pageHeight,
    topMargin: (options?.marginTop ?? DEFAULT_LAYOUT.topMargin) + titleExtra,
    bottomMargin: options?.marginBottom ?? DEFAULT_LAYOUT.bottomMargin,
    leftMargin: options?.marginLeft ?? DEFAULT_LAYOUT.leftMargin,
  };

  const pages = totalPageCount(score, layoutConfig);

  const canvas = document.createElement("canvas");
  const scaledWidth = Math.round(pageWidth * PRINT_SCALE);
  const scaledHeight = Math.round(pageHeight * pages * PRINT_SCALE);
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  canvas.style.width = `${pageWidth}px`;
  canvas.style.height = `${pageHeight * pages}px`;

  const ctx = initRenderer(canvas);

  // VexFlow's resize() auto-applies window.devicePixelRatio, which conflicts
  // with our own PRINT_SCALE. Reset canvas to intended dimensions and apply
  // only PRINT_SCALE.
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  canvas.style.width = `${pageWidth}px`;
  canvas.style.height = `${pageHeight * pages}px`;

  // Reset the transform (canvas.width assignment clears it) and apply only PRINT_SCALE.
  // Use VexFlow's scale() wrapper which delegates to the underlying 2D context.
  const vexCtx = ctx.context as unknown as { scale: (x: number, y: number) => void };
  vexCtx.scale(PRINT_SCALE, PRINT_SCALE);

  renderScore(ctx, canvas, score, undefined, null, viewCfg, pageWidth);

  const pdf = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "in",
    format: [inWidth, inHeight],
  });

  // PDF metadata
  pdf.setProperties({
    title: score.title || "Untitled",
    author: score.composer || undefined,
    creator: "Notation",
  });

  for (let p = 0; p < pages; p++) {
    if (p > 0) pdf.addPage();

    const pageCanvas = document.createElement("canvas");
    const pw = scaledWidth;
    const ph = Math.round(pageHeight * PRINT_SCALE);
    pageCanvas.width = pw;
    pageCanvas.height = ph;

    const pageCtx = pageCanvas.getContext("2d")!;
    pageCtx.drawImage(
      canvas,
      0, p * ph, pw, ph,
      0, 0, pw, ph,
    );

    const imgData = pageCanvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, inWidth, inHeight);
  }

  const partsSuffix =
    viewCfg.partsToShow !== "all" && viewCfg.partsToShow.length === 1
      ? ` - ${score.parts[viewCfg.partsToShow[0]]?.name ?? "Part"}`
      : "";
  pdf.save(`${score.title || "Untitled"}${partsSuffix}.pdf`);
}

/**
 * Export a single part from the score as a PDF.
 */
export async function exportPartPDF(score: Score, partIndex: number): Promise<void> {
  const config: ViewConfig = {
    ...fullScoreConfig(),
    partsToShow: [partIndex],
  };
  return exportPDF(score, config);
}
