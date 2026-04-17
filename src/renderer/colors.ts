/**
 * Central color constants for canvas rendering.
 *
 * CSS/Tailwind colors in React components are NOT included here —
 * only colors used in the canvas rendering pipeline (ScoreRenderer,
 * vexBridge, TabRenderer, SlashRenderer, ScoreCanvas).
 */

// ---------------------------------------------------------------------------
// Notation defaults
// ---------------------------------------------------------------------------
/** Default black for notation elements (noteheads, stems, barlines, text). */
export const INK = "#000";

/** Dark gray for part name labels on the first system. */
export const PART_LABEL = "#333";

/** Medium gray for measure numbers. */
export const MEASURE_NUMBER = "#888";

/** Gray for lyrics text. */
export const LYRIC_TEXT = "#555";

// ---------------------------------------------------------------------------
// Canvas / page background
// ---------------------------------------------------------------------------
/** Off-white parchment background for the score canvas. */
export const CANVAS_BACKGROUND = "#f0e9de";

/** White page background in page-layout mode. */
export const PAGE_BACKGROUND = "#ffffff";

/** Light gray dashed line at page boundaries. */
export const PAGE_BOUNDARY = "#cccccc";

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------
/** Blue used for the edit caret line and ghost notehead. */
export const CURSOR_BLUE = "#3b82f6";

/** Gray playback cursor line. */
export const PLAYBACK_CURSOR = "#888";

// ---------------------------------------------------------------------------
// Voice colors (voices 1–4)
// ---------------------------------------------------------------------------
export const VOICE_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444"] as const;

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
/** Semi-transparent blue overlay for measure selection. */
export const SELECTION_FILL = "rgba(66, 133, 244, 0.15)";

/** Semi-transparent blue overlay for note range selection band. */
export const NOTE_SELECTION_BAND = "rgba(59, 130, 246, 0.18)";

/** Blue used for selected notes/chord heads. */
export const SELECTED_NOTE = "#3b82f6";

// ---------------------------------------------------------------------------
// Note states
// ---------------------------------------------------------------------------
/** Red-ish tone for out-of-range notes. */
export const OUT_OF_RANGE = "#e57373";

/** Semi-transparent black for muted notes. */
export const MUTED_NOTE = "rgba(0,0,0,0.4)";

/** Primary blue for active playback notes. */
export const PLAYBACK_ACTIVE = "#4a6fa5";

// ---------------------------------------------------------------------------
// Layout break marker
// ---------------------------------------------------------------------------
/** Primary blue for break marker icon border and stroke. */
export const BREAK_MARKER = "#4a6fa5";

// ---------------------------------------------------------------------------
// Measure fill indicators
// ---------------------------------------------------------------------------
/** Red for overfilled measures. */
export const OVERFILL = "#ef4444";

/** Amber/yellow for underfilled measures. */
export const UNDERFILL = "#f59e0b";
