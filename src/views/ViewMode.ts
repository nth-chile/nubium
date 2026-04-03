export type ViewModeType = "full-score" | "tab";

export type AnnotationFilter = "chord-symbol" | "lyric" | "rehearsal-mark" | "tempo-mark" | "dynamic" | "hairpin" | "slur";

export interface ViewConfig {
  type: ViewModeType;
  partsToShow: number[] | "all";
  staffType: Record<number, "standard" | "tab">; // per part index
  showAnnotations: AnnotationFilter[];
  layoutConfig: ViewLayoutConfig;
}

export interface ViewLayoutConfig {
  compact: boolean;
  measuresPerLine?: number;
  showPartNames: boolean;
  /** When true, render score with page breaks */
  pageLayout?: boolean;
  /** Override page width in CSS pixels (default: 816 = 8.5in at 96dpi) */
  pageWidth?: number;
  /** Override page height in CSS pixels (default: 1056 = 11in at 96dpi) */
  pageHeight?: number;
  /** Override top margin in pixels */
  topMargin?: number;
  /** Override bottom margin in pixels */
  bottomMargin?: number;
  /** Override left margin in pixels */
  leftMargin?: number;
}

/** Full Score: all parts, full detail (default) */
export function fullScoreConfig(): ViewConfig {
  return {
    type: "full-score",
    partsToShow: "all",
    staffType: {},
    showAnnotations: ["chord-symbol", "lyric", "rehearsal-mark", "tempo-mark", "dynamic", "hairpin", "slur"],
    layoutConfig: {
      compact: false,
      showPartNames: true,
    },
  };
}

/** Tab: tab staff for guitar parts, standard for others */
export function tabConfig(guitarPartIndices: number[] = [0]): ViewConfig {
  const staffType: Record<number, "standard" | "tab"> = {};
  for (const idx of guitarPartIndices) {
    staffType[idx] = "tab";
  }
  return {
    type: "tab",
    partsToShow: "all",
    staffType,
    showAnnotations: ["chord-symbol", "lyric", "rehearsal-mark", "tempo-mark", "dynamic", "hairpin", "slur"],
    layoutConfig: {
      compact: false,
      showPartNames: true,
    },
  };
}

/** Get the default ViewConfig for a given view mode type */
export function getDefaultViewConfig(type: ViewModeType): ViewConfig {
  switch (type) {
    case "full-score":
      return fullScoreConfig();
    case "tab":
      return tabConfig();
  }
}
