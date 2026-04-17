/**
 * Central color constants for canvas rendering.
 *
 * Values are derived from the UI theme in globals.css where possible:
 *   --color-primary: #4a6fa5    (brand blue)
 *   --color-destructive: #ef4444 (red/error)
 *   --color-foreground: #ebebeb
 *   --color-muted-foreground: #a1a1a6
 *
 * Canvas can't read CSS variables at render time, so we duplicate the
 * values here. If the theme changes, update these to match.
 */

// -- Theme-derived ----------------------------------------------------------

/** Brand blue (--color-primary). Used for playback active notes, break markers. */
export const PRIMARY = "#3b82f6";

/** Warm red — desaturated to suit parchment canvas. */
export const DESTRUCTIVE = "#cc4b4b";

// -- Notation ---------------------------------------------------------------

/** Black for notation elements (noteheads, stems, barlines, text). */
export const INK = "#000";

/** Part name labels. */
export const PART_LABEL = "#333";

/** Measure numbers. */
export const MEASURE_NUMBER = "#888";

/** Lyrics text. */
export const LYRIC_TEXT = "#555";

// -- Canvas / page ----------------------------------------------------------

/** Parchment background for the score canvas. */
export const CANVAS_BACKGROUND = "#f0e9de";

/** White page background in page-layout mode. */
export const PAGE_BACKGROUND = "#ffffff";

/** Dashed page boundary lines. */
export const PAGE_BOUNDARY = "#cccccc";

// -- Cursor -----------------------------------------------------------------

/** Edit caret and ghost notehead. */
export const CURSOR_BLUE = PRIMARY;

/** Playback position line. */
export const PLAYBACK_CURSOR = "#888";

// -- Voices (1-4) -----------------------------------------------------------

/** Voice 3 warm amber — shared with underfill indicator. */
export const AMBER = "#e09000";

export const VOICE_COLORS = [PRIMARY, "#2baa35", AMBER, DESTRUCTIVE] as const;

// -- Selection --------------------------------------------------------------

/** Measure selection overlay. */
export const SELECTION_FILL = "rgba(66, 133, 244, 0.15)";

/** Note range selection band. */
export const NOTE_SELECTION_BAND = "rgba(59, 130, 246, 0.18)";

/** Selected notes/chord heads. */
export const SELECTED_NOTE = PRIMARY;

// -- Note states ------------------------------------------------------------

/** Out-of-range notes. */
export const OUT_OF_RANGE = DESTRUCTIVE;

/** Muted note mix ratio — 0.4 means 40% note color, 60% canvas background. */
export const MUTED_MIX = 0.4;

/** Mix a hex color with the canvas background at the given ratio (0–1). */
export function mutedColor(hex: string, mix = MUTED_MIX): string {
  const parse = (h: string) => {
    const c = h.replace("#", "");
    const full = c.length === 3 ? c[0]+c[0]+c[1]+c[1]+c[2]+c[2] : c;
    return [parseInt(full.slice(0,2),16), parseInt(full.slice(2,4),16), parseInt(full.slice(4,6),16)];
  };
  const [fr, fg, fb] = parse(hex);
  const [br, bg, bb] = parse(CANVAS_BACKGROUND);
  const r = Math.round(fr * mix + br * (1 - mix));
  const g = Math.round(fg * mix + bg * (1 - mix));
  const b = Math.round(fb * mix + bb * (1 - mix));
  return `rgb(${r},${g},${b})`;
}

/** Active playback notes. */
export const PLAYBACK_ACTIVE = PRIMARY;

// -- Break markers ----------------------------------------------------------

export const BREAK_MARKER = PRIMARY;

// -- Fill indicators --------------------------------------------------------

/** Overfilled measure. */
export const OVERFILL = DESTRUCTIVE;

/** Underfilled measure — same as voice 3 amber. */
export const UNDERFILL = AMBER;
