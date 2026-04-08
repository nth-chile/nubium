import { TabStave, TabNote, GhostNote, Formatter, Voice, Bend, Vibrato, TabSlide, TabTie, Annotation as VFAnnotation } from "vexflow";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { Articulation } from "../model/note";
import { pitchToTab, STANDARD_TUNING, type Tuning } from "../model/guitar";
import { durationToTicks as durationToTicksFn } from "../model/duration";
import type { RenderContext, NoteBox } from "./vexBridge";
import { TAB_STAFF_HEIGHT } from "./SystemLayout";

// Monkey-patch TabNote.tabToElement to use sans-serif for fret numbers
const origTabToElement = TabNote.tabToElement.bind(TabNote);
TabNote.tabToElement = (fret: string) => {
  const el = origTabToElement(fret);
  // Override serif font for numeric frets
  // "X" dead notes use a music glyph — setting Arial breaks it, so skip
  if (fret.toUpperCase() !== "X") {
    el.setFont("Arial, sans-serif", el.fontInfo?.size, el.fontInfo?.weight);
  }
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

function addArticulationModifier(tn: TabNote, art: Articulation): void {
  switch (art.kind) {
    case "bend": {
      const bendText = art.semitones === 2 ? "Full" : art.semitones === 1 ? "1/2" : `${art.semitones / 2}`;
      const bend = new Bend([{ type: Bend.UP, text: bendText }]);
      tn.addModifier(bend);
      break;
    }
    case "pre-bend": {
      const pbText = art.semitones === 2 ? "Full" : art.semitones === 1 ? "1/2" : `${art.semitones / 2}`;
      const pb = new Bend([{ type: Bend.UP, text: pbText }]);
      tn.addModifier(pb);
      break;
    }
    case "bend-release": {
      const brText = art.semitones === 2 ? "Full" : art.semitones === 1 ? "1/2" : `${art.semitones / 2}`;
      const br = new Bend([
        { type: Bend.UP, text: brText },
        { type: Bend.DOWN, text: "" },
      ]);
      tn.addModifier(br);
      break;
    }
    case "slide-in-below": {
      tn.addModifier(new VFAnnotation("/").setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM));
      break;
    }
    case "slide-in-above": {
      tn.addModifier(new VFAnnotation("\\").setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM));
      break;
    }
    case "slide-out-below": {
      tn.addModifier(new VFAnnotation("\\").setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM));
      break;
    }
    case "slide-out-above": {
      tn.addModifier(new VFAnnotation("/").setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM));
      break;
    }
    case "vibrato": {
      const vib = new Vibrato();
      tn.addModifier(vib);
      break;
    }
    case "palm-mute": {
      const pm = new VFAnnotation("P.M.")
        .setVerticalJustification(VFAnnotation.VerticalJustify.TOP);
      tn.addModifier(pm);
      break;
    }
    case "harmonic": {
      const harm = new VFAnnotation("Harm.")
        .setVerticalJustification(VFAnnotation.VerticalJustify.TOP);
      tn.addModifier(harm);
      break;
    }
    case "let-ring": {
      const lr = new VFAnnotation("let ring")
        .setVerticalJustification(VFAnnotation.VerticalJustify.TOP);
      tn.addModifier(lr);
      break;
    }
    case "down-stroke": {
      const ds = new VFAnnotation("↓")
        .setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM);
      tn.addModifier(ds);
      break;
    }
    case "up-stroke": {
      const us = new VFAnnotation("↑")
        .setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM);
      tn.addModifier(us);
      break;
    }
    case "fingerpick-p":
    case "fingerpick-i":
    case "fingerpick-m":
    case "fingerpick-a": {
      const letter = art.kind.split("-")[1]; // p, i, m, a
      const fp = new VFAnnotation(letter)
        .setVerticalJustification(VFAnnotation.VerticalJustify.BOTTOM);
      tn.addModifier(fp);
      break;
    }
    case "tapping": {
      const tap = new VFAnnotation("T")
        .setVerticalJustification(VFAnnotation.VerticalJustify.TOP);
      tn.addModifier(tap);
      break;
    }
    case "tremolo-picking": {
      const tp = new VFAnnotation("TP")
        .setVerticalJustification(VFAnnotation.VerticalJustify.TOP);
      tn.addModifier(tp);
      break;
    }
    // slide-up, slide-down, hammer-on, pull-off are handled as ties between notes
    // ghost-note, dead-note handled in eventToTabNote
    default:
      break;
  }
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
    renderTabConnections(ctx, modelVoice.events, allTabNotes);

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
