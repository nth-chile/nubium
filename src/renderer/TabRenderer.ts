import { TabStave, TabNote, GhostNote, Formatter, Voice, Bend, Vibrato, TabSlide, TabTie, Annotation as VFAnnotation, Element, Tremolo } from "vexflow";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { Articulation } from "../model/note";
import { pitchToTab, STANDARD_TUNING, type Tuning } from "../model/guitar";
import { durationToTicks as durationToTicksFn } from "../model/duration";
import type { RenderContext, NoteBox } from "./vexBridge";
import { TAB_STAFF_HEIGHT } from "./SystemLayout";

// Monkey-patch TabNote.tabToElement to use sans-serif for all frets.
// VexFlow renders "X" as a double-sharp glyph (accidentalDoubleSharp) which looks wrong.
// Override to render "X" as plain text in the same font as fret numbers.
TabNote.tabToElement = (fret: string) => {
  const el = new Element("TabNote.text");
  el.setText(fret.toUpperCase() === "X" ? "X" : fret);
  el.setFont("Arial, sans-serif", el.fontInfo?.size, el.fontInfo?.weight);
  el.setYShift(el.getHeight() / 2);
  return el;
};

export interface TabMeasureRenderResult {
  noteBoxes: NoteBox[];
  staveY: number;
  staveX: number;
  width: number;
  vexStave?: import("vexflow").Stave;
}

const DUR_VEX: Record<string, string> = {
  whole: "w",
  half: "h",
  quarter: "q",
  eighth: "8",
  "16th": "16",
  "32nd": "32",
  "64th": "64",
};

function getTabPositions(
  event: NoteEvent,
  tuning: Tuning,
  capo: number
): { str: number; fret: number }[] {
  switch (event.kind) {
    case "note": {
      const tab = event.tabInfo ?? event.head.tabInfo ?? pitchToTab(event.head.pitch, tuning);
      const fret = Math.max(0, tab.fret - capo);
      return [{ str: tab.string, fret }];
    }
    case "chord": {
      return event.heads.map((h) => {
        const tab = h.tabInfo ?? pitchToTab(h.pitch, tuning);
        const fret = Math.max(0, tab.fret - capo);
        return { str: tab.string, fret };
      });
    }
    case "rest":
    case "slash":
    case "grace":
      return [];
  }
}

/** Check if an event has a specific articulation */
function hasArticulation(event: NoteEvent, kind: Articulation["kind"]): boolean {
  if (event.kind !== "note" && event.kind !== "chord") return false;
  return event.articulations?.some((a) => a.kind === kind) ?? false;
}

function eventToTabNote(
  event: NoteEvent,
  tuning: Tuning,
  capo: number
): TabNote | GhostNote | null {
  const dur = DUR_VEX[event.duration.type];
  if (!dur) return null;

  if (event.kind === "rest") {
    return new GhostNote({ duration: dur });
  }

  const positions = getTabPositions(event, tuning, capo);
  if (positions.length === 0) return null;

  // Dead notes: render "X" on each string position
  const isDead = hasArticulation(event, "dead-note");
  // Ghost notes: render fret in parentheses
  const isGhost = hasArticulation(event, "ghost-note");

  let tabPositions: { str: number; fret: string | number }[];
  if (isDead) {
    tabPositions = positions.map((p) => ({ str: p.str, fret: "X" as unknown as number }));
  } else if (isGhost) {
    tabPositions = positions.map((p) => ({ str: p.str, fret: `(${p.fret})` as unknown as number }));
  } else {
    tabPositions = positions;
  }

  const tn = new TabNote({
    positions: tabPositions,
    duration: dur,
  });
  // Add articulations as modifiers
  if (event.kind === "note" || event.kind === "chord") {
    const articulations = event.articulations ?? [];
    for (const art of articulations) {
      addArticulationModifier(tn, art);
    }
  }

  return tn;
}

function bendLabel(semitones: number | undefined): string {
  if (semitones == null || isNaN(semitones)) return "Full";
  if (semitones === 1) return "½";
  if (semitones === 2) return "Full";
  if (semitones === 3) return "1½";
  return `${Math.floor(semitones / 2)}${semitones % 2 ? "½" : ""}`;
}

function addArticulationModifier(tn: TabNote, art: Articulation): void {
  switch (art.kind) {
    case "bend": {
      const bendText = bendLabel(art.semitones);
      const bend = new Bend([{ type: Bend.UP, text: bendText }]);
      tn.addModifier(bend);
      break;
    }
    case "pre-bend": {
      // VexFlow has no native pre-bend look — use bend arrow + "PB" marker
      // Renders same as bend visually but text distinguishes it
      const pb = new Bend([{ type: Bend.UP, text: bendLabel(art.semitones) }]);
      pb.setTap("PB");
      tn.addModifier(pb);
      break;
    }
    case "bend-release": {
      const br = new Bend([
        { type: Bend.UP, text: bendLabel(art.semitones) },
        { type: Bend.DOWN, text: "" },
      ]);
      tn.addModifier(br);
      break;
    }
    case "vibrato": {
      const vib = new Vibrato();
      tn.addModifier(vib);
      break;
    }
    case "tremolo-picking": {
      tn.addModifier(new Tremolo(3));
      break;
    }
    // All other techniques — handled by drawTabAnnotations() after VexFlow render
    // slide-up, slide-down, hammer-on, pull-off are handled as ties between notes
    // ghost-note, dead-note handled in eventToTabNote
    default:
      break;
  }
}

// On-staff text labels (Guitar Pro style: italic text on the top staff line)
const ON_STAFF_TEXTS: Record<string, string> = {
  "palm-mute": "P.M.",
  "harmonic": "N.H.",
  "let-ring": "let ring",
  "tapping": "T",
};
// Below-staff labels
const BELOW_STAFF_TEXTS: Record<string, string> = {
  "down-stroke": "П",   // down-pick (square-U shape, standard in tab)
  "up-stroke": "V",     // up-pick
  "fingerpick-p": "p",
  "fingerpick-i": "i",
  "fingerpick-m": "m",
  "fingerpick-a": "a",
};

// Custom post-render drawing — VexFlow annotations don't position correctly for tab
function drawTabAnnotations(
  ctx: RenderContext,
  events: NoteEvent[],
  tabNotes: (TabNote | GhostNote)[],
  staveY: number
): void {
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  const prevFont = rawCtx.font;
  const prevFill = rawCtx.fillStyle;
  const prevStroke = rawCtx.strokeStyle;
  const prevLineWidth = rawCtx.lineWidth;

  // Tab staff line positions: VexFlow TabStave has ~40px top padding before first line
  // 6 lines, ~13px spacing between lines
  const firstLineY = staveY + 40;
  const onStaffTextY = firstLineY - 2; // just above first line, on the staff
  const belowStaffY = staveY + TAB_STAFF_HEIGHT + 14;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.kind === "rest" || event.kind === "slash") continue;
    const tn = tabNotes[i];
    if (!tn || tn instanceof GhostNote) continue;

    const arts = event.articulations ?? [];
    const noteX = (tn as any).getAbsoluteX?.() ?? 0;
    if (noteX === 0) continue;

    for (const art of arts) {
      // On-staff italic text (P.M., N.H., let ring, T)
      const onStaffText = ON_STAFF_TEXTS[art.kind];
      if (onStaffText) {
        rawCtx.font = "italic 10px sans-serif";
        rawCtx.fillStyle = typeof prevFill === "string" ? prevFill : "#000";
        rawCtx.fillText(onStaffText, noteX - 4, onStaffTextY);
        continue;
      }

      // Below-staff text (strokes, fingerpicking)
      const belowText = BELOW_STAFF_TEXTS[art.kind];
      if (belowText) {
        rawCtx.font = "12px sans-serif";
        rawCtx.fillStyle = typeof prevFill === "string" ? prevFill : "#000";
        rawCtx.fillText(belowText, noteX - 3, belowStaffY);
        continue;
      }

      // Slide-in: short diagonal line before the note
      // from-below: line goes ↗ into note, from-above: line goes ↘ into note
      if (art.kind === "slide-in-below" || art.kind === "slide-in-above") {
        rawCtx.strokeStyle = typeof prevStroke === "string" ? prevStroke : "#000";
        rawCtx.lineWidth = 1.5;
        const endX = noteX - 3;
        const startX = endX - 12;
        const midY = firstLineY + 38; // center of tab staff
        const yOff = 4; // shallow angle
        rawCtx.beginPath();
        if (art.kind === "slide-in-below") {
          rawCtx.moveTo(startX, midY + yOff);
          rawCtx.lineTo(endX, midY - yOff);
        } else {
          rawCtx.moveTo(startX, midY - yOff);
          rawCtx.lineTo(endX, midY + yOff);
        }
        rawCtx.stroke();
        continue;
      }

      // Slide-out: short diagonal line after the note
      // out-above: line goes ↗ away, out-below: line goes ↘ away
      if (art.kind === "slide-out-below" || art.kind === "slide-out-above") {
        rawCtx.strokeStyle = typeof prevStroke === "string" ? prevStroke : "#000";
        rawCtx.lineWidth = 1.5;
        const startX = noteX + 6;
        const endX = startX + 12;
        const midY = firstLineY + 38;
        const yOff = 4;
        rawCtx.beginPath();
        if (art.kind === "slide-out-above") {
          rawCtx.moveTo(startX, midY + yOff);
          rawCtx.lineTo(endX, midY - yOff);
        } else {
          rawCtx.moveTo(startX, midY - yOff);
          rawCtx.lineTo(endX, midY + yOff);
        }
        rawCtx.stroke();
        continue;
      }
    }
  }

  rawCtx.font = prevFont;
  rawCtx.fillStyle = prevFill;
  rawCtx.strokeStyle = prevStroke;
  rawCtx.lineWidth = prevLineWidth;
}

/**
 * Render a measure as a tab staff.
 */
export function renderTabMeasure(
  ctx: RenderContext,
  m: Measure,
  x: number,
  y: number,
  width: number,
  showClef: boolean,
  tuning: Tuning = STANDARD_TUNING,
  partIndex = 0,
  measureIndex = 0,
  capo = 0
): TabMeasureRenderResult {
  const stave = new TabStave(x, y, width);
  if (showClef) {
    stave.addClef("tab");
  }
  // Show capo indicator on first measure
  if (capo > 0 && showClef) {
    stave.setContext(ctx.context);
    stave.draw();
    // Draw capo text above the stave
    const rawCtx = ctx.context as unknown as { fillText(text: string, x: number, y: number): void; font: string };
    const prevFont = rawCtx.font;
    rawCtx.font = "italic 11px serif";
    rawCtx.fillText(`Capo ${capo}`, x + 6, y - 5);
    rawCtx.font = prevFont;
  } else {
    stave.setContext(ctx.context).draw();
  }

  const noteBoxes: NoteBox[] = [];
  const allTabNotes: (TabNote | GhostNote)[] = [];
  const matchedEvents: NoteEvent[] = []; // events that produced tab notes (1:1 with allTabNotes)
  const eventIds: NoteEventId[] = [];

  // Process first voice only for tab (tab is typically single-voice)
  const modelVoice = m.voices[0];
  if (!modelVoice || modelVoice.events.length === 0) {
    return { noteBoxes, staveY: y, staveX: x, width, vexStave: stave };
  }

  for (const event of modelVoice.events) {
    const tn = eventToTabNote(event, tuning, capo);
    if (tn) {
      allTabNotes.push(tn);
      matchedEvents.push(event);
      eventIds.push(event.id);
    }
  }

  if (allTabNotes.length > 0) {
    const totalTicks = modelVoice.events.reduce((sum, e) => {
      return sum + durationToTicksFn(e.duration);
    }, 0);
    const beats = totalTicks / 480;

    const vfVoice = new Voice({
      numBeats: beats,
      beatValue: 4,
    }).setStrict(false);
    vfVoice.addTickables(allTabNotes);

    const formatter = new Formatter();
    const formattingWidth = width - (stave.getNoteStartX() - x) - 10;
    formatter.format([vfVoice], Math.max(formattingWidth, 50));

    vfVoice.draw(ctx.context, stave);

    // Render slides and ties between consecutive notes
    renderTabConnections(ctx, matchedEvents, allTabNotes);

    // Draw above-staff text annotations and slide-in/out lines
    drawTabAnnotations(ctx, matchedEvents, allTabNotes, y);

    // Collect bounding boxes (skip GhostNotes — they have no visual)
    // VexFlow TabNote.getBoundingBox() returns y=0/h=0, so use stave position instead
    allTabNotes.forEach((tn, idx) => {
      if (tn instanceof GhostNote) return;
      const absX = (tn as any).getAbsoluteX?.() ?? stave.getNoteStartX();
      const noteWidth = 20; // reasonable click target width for tab numbers
      noteBoxes.push({
        id: eventIds[idx],
        x: absX - noteWidth / 2,
        y,
        width: noteWidth,
        height: TAB_STAFF_HEIGHT,
        headX: absX - noteWidth / 2,
        headY: y,
        headWidth: noteWidth,
        headHeight: TAB_STAFF_HEIGHT,
        partIndex,
        measureIndex,
        voiceIndex: 0,
        eventIndex: idx,
      });
    });
  }

  return { noteBoxes, staveY: y, staveX: x, width, vexStave: stave };
}

/**
 * Render slide/hammer-on/pull-off connections between consecutive tab notes.
 */
function renderTabConnections(
  ctx: RenderContext,
  events: NoteEvent[],
  tabNotes: (TabNote | GhostNote)[]
): void {
  for (let i = 0; i < events.length - 1; i++) {
    const event = events[i];
    if (event.kind === "rest" || event.kind === "slash") continue;

    const articulations = event.articulations ?? [];
    for (const art of articulations) {
      if (art.kind === "slide-up" || art.kind === "slide-down") {
        try {
          const slide = new TabSlide({
            firstNote: tabNotes[i] as TabNote,
            lastNote: tabNotes[i + 1] as TabNote,
          }, art.kind === "slide-up"
            ? TabSlide.SLIDE_UP
            : TabSlide.SLIDE_DOWN);
          slide.setContext(ctx.context).draw();
        } catch {
          // Skip if VexFlow rejects the slide
        }
      } else if (art.kind === "hammer-on" || art.kind === "pull-off") {
        try {
          const tie = new TabTie({
            firstNote: tabNotes[i] as TabNote,
            lastNote: tabNotes[i + 1] as TabNote,
          }, art.kind === "hammer-on" ? "H" : "P");
          tie.setContext(ctx.context).draw();
        } catch {
          // Skip if VexFlow rejects the tie
        }
      }
    }
  }
}
