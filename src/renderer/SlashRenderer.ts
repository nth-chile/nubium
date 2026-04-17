import { Stave, StaveNote, Dot, Beam, Formatter, Voice, GhostNote } from "vexflow";
import type { Measure, NoteEventId } from "../model";
import { durationToTicks as durationToTicksFn, measureCapacity as measureCapacityFn } from "../model/duration";
import { getBeamGroups } from "./beaming";
import type { RenderContext, NoteBox, MeasureRenderResult, AnnotationBox } from "./vexBridge";
import { applyBarline, applyStaveDecorations, drawStaveAnnotations } from "./vexBridge";
import { INK } from "./colors";

const DUR_VEX: Record<string, string> = {
  whole: "w",
  half: "h",
  quarter: "q",
  eighth: "8",
  "16th": "16",
  "32nd": "32",
  "64th": "64",
};

/**
 * Render a measure as slash notation using VexFlow's built-in slash noteheads.
 * Uses StaveNote with "s" duration suffix for proper rendering of noteheads,
 * stems, flags, and beaming — all handled by VexFlow.
 */
export function renderSlashMeasure(
  ctx: RenderContext,
  m: Measure,
  x: number,
  y: number,
  width: number,
  showClef: boolean,
  showTimeSig: boolean,
  showKeySig: boolean,
  options: {
    partIndex?: number;
    measureIndex?: number;
    prevMeasure?: Measure;
    isTopStave?: boolean;
  } = {}
): MeasureRenderResult {
  const partIndex = options.partIndex ?? 0;
  const measureIndex = options.measureIndex ?? 0;

  const stave = new Stave(x, y, width);
  if (showClef) stave.addClef("treble");
  if (showTimeSig) {
    stave.addTimeSignature(`${m.timeSignature.numerator}/${m.timeSignature.denominator}`);
  }
  if (showKeySig && m.keySignature.fifths !== 0) {
    const keyMap: Record<number, string> = {
      1: "G", 2: "D", 3: "A", 4: "E", 5: "B", 6: "F#", 7: "C#",
      "-1": "F", "-2": "Bb", "-3": "Eb", "-4": "Ab", "-5": "Db", "-6": "Gb", "-7": "Cb",
    };
    const keySig = keyMap[m.keySignature.fifths];
    if (keySig) stave.addKeySignature(keySig);
  }

  // Barlines always; volta/segno/coda only when topmost stave
  applyBarline(stave, m.barlineEnd);
  if (options.isTopStave) applyStaveDecorations(stave, m);

  stave.setContext(ctx.context).draw();

  // Draw coda, navigation text, tempo, rehearsal marks
  if (options.isTopStave) drawStaveAnnotations(ctx, stave, m, x, y, width);

  const noteBoxes: NoteBox[] = [];
  const annotationBoxes: AnnotationBox[] = [];
  const staveNoteMap = new Map<NoteEventId, StaveNote>();

  const modelVoice = m.voices[0];
  if (!modelVoice || modelVoice.events.length === 0) {
    return { noteBoxes, annotationBoxes, staveY: y, staveX: x, width, staveNoteMap, vexStave: stave };
  }

  // Build StaveNotes with slash noteheads
  const staveNotes: StaveNote[] = [];
  const eventIds: NoteEventId[] = [];

  for (const event of modelVoice.events) {
    const dur = DUR_VEX[event.duration.type];
    if (!dur) continue;

    if (event.kind === "rest") {
      // Rests render as normal rests in slash notation
      const sn = new StaveNote({
        keys: ["b/4"],
        duration: dur + "r",
      });
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      staveNotes.push(sn);
      eventIds.push(event.id);
    } else {
      // All non-rest events render as slash noteheads on middle line
      const sn = new StaveNote({
        keys: ["b/4"],
        duration: dur + "s",
        stemDirection: 1,
      });
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      staveNotes.push(sn);
      eventIds.push(event.id);
      staveNoteMap.set(event.id, sn);
    }
  }

  if (staveNotes.length === 0) {
    return { noteBoxes, annotationBoxes, staveY: y, staveX: x, width, staveNoteMap, vexStave: stave };
  }

  // Create voice and add notes
  const totalTicks = modelVoice.events.reduce((sum, e) => sum + durationToTicksFn(e.duration), 0);
  const capacity = measureCapacityFn(m.timeSignature.numerator, m.timeSignature.denominator);
  const beats = Math.max(totalTicks, capacity) / 480;

  const vfVoice = new Voice({ numBeats: beats, beatValue: 4 }).setStrict(false);
  vfVoice.addTickables(staveNotes);

  // Pad with ghost notes if voice doesn't fill the measure
  let remaining = capacity - totalTicks;
  if (remaining > 0) {
    const ghostDurs: [number, string][] = [[1920, "w"], [960, "h"], [480, "q"], [240, "8"], [120, "16"], [60, "32"]];
    while (remaining > 0) {
      const entry = ghostDurs.find(([t]) => t <= remaining);
      if (!entry) break;
      vfVoice.addTickable(new GhostNote({ duration: entry[1] }));
      remaining -= entry[0];
    }
  }

  // Format
  const formatter = new Formatter();
  try {
    formatter.joinVoices([vfVoice]);
  } catch { /* tick mismatch */ }
  const formattingWidth = width - (stave.getNoteStartX() - x) - 10;
  try {
    formatter.format([vfVoice], Math.max(formattingWidth, 50));
  } catch { /* format error */ }

  // Beam groups
  const nonGraceEvents = modelVoice.events.filter((e) => e.kind !== "grace");
  const beamGroups = getBeamGroups(nonGraceEvents, m.timeSignature);
  const beams: Beam[] = [];
  for (const group of beamGroups) {
    const beamNotes = group.map((idx) => staveNotes[idx]);
    if (beamNotes.length >= 2) {
      try {
        beams.push(new Beam(beamNotes));
      } catch { /* incompatible notes */ }
    }
  }

  // Draw
  vfVoice.draw(ctx.context, stave);
  for (const beam of beams) {
    beam.setContext(ctx.context).draw();
  }

  // Collect bounding boxes for noteBoxes
  staveNotes.forEach((sn, idx) => {
    const bb = sn.getBoundingBox();
    if (bb) {
      const bx = bb.getX(), by = bb.getY(), bw = bb.getW(), bh = bb.getH();
      const nhX = sn.getNoteHeadBeginX();
      const nhEndX = sn.getNoteHeadEndX();
      const nhWidth = nhEndX - nhX;
      let headY = by, headH = bh;
      try {
        const nhBounds = sn.getNoteHeadBounds();
        if (nhBounds.yTop != null && nhBounds.yBottom != null) {
          headY = nhBounds.yTop;
          headH = nhBounds.yBottom - nhBounds.yTop;
        }
      } catch { /* pre-render */ }
      noteBoxes.push({
        id: eventIds[idx],
        x: bx, y: by, width: bw, height: bh,
        headX: nhWidth > 0 ? nhX : bx,
        headY,
        headWidth: nhWidth > 0 ? nhWidth : bw,
        headHeight: Math.max(headH, 10),
        partIndex,
        measureIndex,
        voiceIndex: 0,
        eventIndex: idx,
      });
    }
  });

  // Render chord symbols above slash stave when it's the topmost stave
  if (options.isTopStave) {
    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    const chordAnns = m.annotations.filter((a): a is import("../model/annotations").ChordSymbol => a.kind === "chord-symbol");
    if (chordAnns.length > 0 && rawCtx.save) {
      rawCtx.save();
      rawCtx.font = "bold 14px sans-serif";
      rawCtx.fillStyle = INK;
      const chordY = y - 4;
      const renderedIds = new Set<string>();
      for (const ann of chordAnns) {
        if (ann.noteEventId && renderedIds.has(ann.noteEventId)) continue;
        const box = ann.noteEventId ? noteBoxes.find((nb) => nb.id === ann.noteEventId) : undefined;
        const chordX = box ? box.x : x + 4;
        rawCtx.fillText(ann.text, chordX, chordY);
        if (ann.noteEventId) renderedIds.add(ann.noteEventId);
      }
      rawCtx.restore();
    }
  }

  return { noteBoxes, annotationBoxes, staveY: y, staveX: x, width, staveNoteMap, vexStave: stave };
}
