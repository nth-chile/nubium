import { TabStave, TabNote, GhostNote, Formatter, Voice, Bend, Vibrato, TabSlide, TabTie } from "vexflow";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { Articulation } from "../model/note";
import { pitchToTab, STANDARD_TUNING, type Tuning } from "../model/guitar";
import { durationToTicks as durationToTicksFn } from "../model/duration";
import type { RenderContext, NoteBox } from "./vexBridge";

export interface TabMeasureRenderResult {
  noteBoxes: NoteBox[];
  staveY: number;
  staveX: number;
  width: number;
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
  tuning: Tuning
): { str: number; fret: number }[] {
  switch (event.kind) {
    case "note": {
      const tab = event.tabInfo ?? event.head.tabInfo ?? pitchToTab(event.head.pitch, tuning);
      return [{ str: tab.string, fret: tab.fret }];
    }
    case "chord": {
      return event.heads.map((h) => {
        const tab = h.tabInfo ?? pitchToTab(h.pitch, tuning);
        return { str: tab.string, fret: tab.fret };
      });
    }
    case "rest":
    case "slash":
    case "grace":
      return [];
  }
}

function eventToTabNote(
  event: NoteEvent,
  tuning: Tuning
): TabNote | GhostNote | null {
  const dur = DUR_VEX[event.duration.type];
  if (!dur) return null;

  if (event.kind === "rest") {
    // GhostNote takes up rhythmic space but renders nothing — correct for tab rests
    return new GhostNote({ duration: dur });
  }

  const positions = getTabPositions(event, tuning);
  if (positions.length === 0) return null;

  const tn = new TabNote({
    positions,
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
      // VexFlow 5 Bend takes BendPhrase[] array
      const bend = new Bend([{ type: Bend.UP, text: bendText }]);
      tn.addModifier(bend);
      break;
    }
    case "vibrato": {
      const vib = new Vibrato();
      tn.addModifier(vib);
      break;
    }
    // slide-up, slide-down, hammer-on, pull-off are handled as ties between notes
    // They are rendered as TabSlide/TabTie in the post-processing step
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
  measureIndex = 0
): TabMeasureRenderResult {
  const stave = new TabStave(x, y, width);
  if (showClef) {
    stave.addClef("tab");
  }
  stave.setContext(ctx.context).draw();

  const noteBoxes: NoteBox[] = [];
  const allTabNotes: (TabNote | GhostNote)[] = [];
  const eventIds: NoteEventId[] = [];

  // Process first voice only for tab (tab is typically single-voice)
  const modelVoice = m.voices[0];
  if (!modelVoice || modelVoice.events.length === 0) {
    return { noteBoxes, staveY: y, staveX: x, width };
  }

  for (const event of modelVoice.events) {
    const tn = eventToTabNote(event, tuning);
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
    allTabNotes.forEach((tn, idx) => {
      if (tn instanceof GhostNote) return;
      const bb = tn.getBoundingBox();
      if (bb) {
        noteBoxes.push({
          id: eventIds[idx],
          x: bb.getX(),
          y: bb.getY(),
          width: bb.getW(),
          height: bb.getH(),
          headX: bb.getX(),
          headY: bb.getY(),
          headWidth: bb.getW(),
          headHeight: bb.getH(),
          partIndex,
          measureIndex,
          voiceIndex: 0,
          eventIndex: idx,
        });
      }
    });
  }

  return { noteBoxes, staveY: y, staveX: x, width };
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
