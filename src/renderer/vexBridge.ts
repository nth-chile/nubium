import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, Beam, StaveConnector, Barline, Repetition, Volta as VexVolta, StaveTie, StaveHairpin, MultiMeasureRest, Tuplet as VexTuplet, Articulation as VexArticulation, Ornament as VexOrnament, Annotation as VexAnnotation, StaveText, StaveModifierPosition, GraceNote as VexGraceNote, GraceNoteGroup, GhostNote } from "vexflow";
import type { ChordSymbol, DynamicMark, Lyric, Hairpin } from "../model/annotations";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { BarlineType } from "../model/time";
import type { Annotation, TempoMark } from "../model/annotations";
import type { ArticulationKind } from "../model/note";
import type { Stylesheet } from "../model/stylesheet";
import { resolveStylesheet } from "../model/stylesheet";
import { durationToTicks as durationToTicksFn, measureCapacity as measureCapacityFn, voiceTicksUsed as voiceTicksUsedFn } from "../model/duration";
import { getBeamGroups } from "./beaming";
import { useEditorStore } from "../state/EditorState";

export interface RenderContext {
  renderer: Renderer;
  context: ReturnType<Renderer["getContext"]>;
}

export interface NoteBox {
  id: NoteEventId;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Tighter bounds for visual highlights (cursor/selection), excluding grace notes */
  headX: number;
  headY: number;
  headWidth: number;
  headHeight: number;
  partIndex: number;
  measureIndex: number;
  voiceIndex: number;
  eventIndex: number;
}

export interface AnnotationBox {
  kind: "chord-symbol" | "lyric";
  x: number;
  y: number;
  width: number;
  height: number;
  partIndex: number;
  measureIndex: number;
  noteEventId: NoteEventId;
  text: string;
}

export interface MeasureRenderResult {
  noteBoxes: NoteBox[];
  annotationBoxes: AnnotationBox[];
  staveY: number;
  staveX: number;
  width: number;
}

const ACC_VEX: Record<string, string> = {
  sharp: "#",
  flat: "b",
  "double-sharp": "##",
  "double-flat": "bb",
};

const DUR_VEX: Record<string, string> = {
  whole: "w",
  half: "h",
  quarter: "q",
  eighth: "8",
  "16th": "16",
  "32nd": "32",
  "64th": "64",
};

const ARTICULATION_VEX: Partial<Record<ArticulationKind, string>> = {
  staccato: "a.",
  staccatissimo: "av",
  accent: "a>",
  tenuto: "a-",
  fermata: "a@a",
  marcato: "a^",
  "up-bow": "a|",
  "down-bow": "am",
  "open-string": "ao",
  stopped: "a+",
  trill: "tr",
  mordent: "mordent",
  turn: "turn",
};

const ORNAMENT_KINDS = new Set(["trill", "mordent", "turn"]);

function addArticulations(sn: StaveNote, event: NoteEvent): void {
  if ((event.kind === "note" || event.kind === "chord" || event.kind === "grace") && event.articulations) {
    for (const art of event.articulations) {
      const code = ARTICULATION_VEX[art.kind];
      if (!code) continue;
      if (ORNAMENT_KINDS.has(art.kind)) {
        sn.addModifier(new VexOrnament(code));
      } else {
        sn.addModifier(new VexArticulation(code));
      }
    }
  }
}

export function initRenderer(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
  renderer.resize(canvas.width, canvas.height);
  const context = renderer.getContext();
  return { renderer, context };
}

function pitchToVexKey(p: { pitchClass: string; octave: number }): string {
  return `${p.pitchClass.toLowerCase()}/${p.octave}`;
}

function eventToStaveNote(
  event: NoteEvent,
  stemDirection?: "up" | "down",
  clef?: string,
): StaveNote | null {
  switch (event.kind) {
    case "note": {
      const key = pitchToVexKey(event.head.pitch);
      const dur = DUR_VEX[event.duration.type];
      const opts: { keys: string[]; duration: string; stemDirection?: number; clef?: string } = {
        keys: [key],
        duration: dur,
      };
      if (clef) opts.clef = clef;
      if (stemDirection === "up") opts.stemDirection = 1;
      else if (stemDirection === "down") opts.stemDirection = -1;
      const sn = new StaveNote(opts);
      const acc = event.head.pitch.accidental;
      if (acc !== "natural" && ACC_VEX[acc]) {
        sn.addModifier(new Accidental(ACC_VEX[acc]));
      }
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      addArticulations(sn, event);
      return sn;
    }
    case "chord": {
      const keys = event.heads.map((h) => pitchToVexKey(h.pitch));
      const dur = DUR_VEX[event.duration.type];
      const opts: { keys: string[]; duration: string; stemDirection?: number; clef?: string } = {
        keys,
        duration: dur,
      };
      if (clef) opts.clef = clef;
      if (stemDirection === "up") opts.stemDirection = 1;
      else if (stemDirection === "down") opts.stemDirection = -1;
      const sn = new StaveNote(opts);
      event.heads.forEach((h, idx) => {
        const acc = h.pitch.accidental;
        if (acc !== "natural" && ACC_VEX[acc]) {
          sn.addModifier(new Accidental(ACC_VEX[acc]), idx);
        }
      });
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      addArticulations(sn, event);
      return sn;
    }
    case "rest": {
      const dur = DUR_VEX[event.duration.type] + "r";
      const opts: { keys: string[]; duration: string; stemDirection?: number } = {
        keys: [stemDirection === "down" ? "d/4" : stemDirection === "up" ? "f/5" : "b/4"],
        duration: dur,
      };
      if (stemDirection === "up") opts.stemDirection = 1;
      else if (stemDirection === "down") opts.stemDirection = -1;
      const sn = new StaveNote(opts);
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      return sn;
    }
    case "slash": {
      const dur = DUR_VEX[event.duration.type] + "s";
      const sn = new StaveNote({
        keys: ["b/4"],
        duration: dur,
        stemDirection: 1,
      });
      for (let i = 0; i < event.duration.dots; i++) {
        Dot.buildAndAttach([sn], { all: true });
      }
      return sn;
    }
    case "grace":
      // Grace notes are handled separately as modifiers
      return null;
  }
}

function eventToGraceNote(event: import("../model/note").GraceNote): VexGraceNote {
  const key = pitchToVexKey(event.head.pitch);
  const dur = DUR_VEX[event.duration.type];
  const gn = new VexGraceNote({ keys: [key], duration: dur, slash: event.slash ?? true });
  const acc = event.head.pitch.accidental;
  if (acc !== "natural" && ACC_VEX[acc]) {
    gn.addModifier(new Accidental(ACC_VEX[acc]));
  }
  return gn;
}

const CLEF_VEX: Record<string, string> = {
  treble: "treble",
  bass: "bass",
  alto: "alto",
  tenor: "tenor",
};

const KEY_SIG_MAP: Record<number, string> = {
  "-7": "Cb",
  "-6": "Gb",
  "-5": "Db",
  "-4": "Ab",
  "-3": "Eb",
  "-2": "Bb",
  "-1": "F",
  "0": "C",
  "1": "G",
  "2": "D",
  "3": "A",
  "4": "E",
  "5": "B",
  "6": "F#",
  "7": "C#",
};

/** Stem direction per voice index when multiple voices are active: even=up, odd=down */
function voiceStemDirection(voiceIndex: number, multiVoice: boolean): "up" | "down" | undefined {
  if (!multiVoice) return undefined;
  return voiceIndex % 2 === 0 ? "up" : "down";
}

function applyBarline(stave: Stave, barlineType: BarlineType): void {
  switch (barlineType) {
    case "double":
      stave.setEndBarType(Barline.type.DOUBLE);
      break;
    case "final":
      stave.setEndBarType(Barline.type.END);
      break;
    case "repeat-start":
      stave.setBegBarType(Barline.type.REPEAT_BEGIN);
      break;
    case "repeat-end":
      stave.setEndBarType(Barline.type.REPEAT_END);
      break;
    case "repeat-both":
      stave.setBegBarType(Barline.type.REPEAT_BEGIN);
      stave.setEndBarType(Barline.type.REPEAT_END);
      break;
    case "single":
    default:
      // Default single barline, no special handling needed
      break;
  }
}

export function renderMeasure(
  ctx: RenderContext,
  m: Measure,
  x: number,
  y: number,
  width: number,
  showClef: boolean,
  showTimeSig: boolean,
  showKeySig: boolean,
  stylesheet?: Partial<Stylesheet>,
  partIndex = 0,
  measureIndex = 0,
  activeNoteIds?: Set<NoteEventId>
): MeasureRenderResult {
  const style = resolveStylesheet(stylesheet);

  const stave = new Stave(x, y, width);
  if (showClef) stave.addClef(CLEF_VEX[m.clef.type] || "treble");
  if (showKeySig) {
    const keySig = KEY_SIG_MAP[m.keySignature.fifths] ?? "C";
    stave.addKeySignature(keySig);
  }
  if (showTimeSig) {
    stave.addTimeSignature(`${m.timeSignature.numerator}/${m.timeSignature.denominator}`);
  }

  // Set barline types
  applyBarline(stave, m.barlineEnd);

  // Add volta bracket if present
  if (m.navigation?.volta) {
    const volta = m.navigation.volta;
    const label = volta.label ?? volta.endings.join(", ") + ".";
    try {
      stave.setVoltaType(VexVolta.type.BEGIN, label, 25);
    } catch {
      // VexFlow may not support this in all versions; fall back to text
    }
  }

  // Add repetition signs for segno/coda
  if (m.navigation?.segno) {
    try {
      stave.addModifier(new Repetition(Repetition.type.SEGNO_LEFT, x, 0));
    } catch {
      // Fallback handled via text rendering below
    }
  }
  if (m.navigation?.coda) {
    try {
      stave.addModifier(new Repetition(Repetition.type.CODA_LEFT, x, 0));
    } catch {
      // Fallback handled via text rendering below
    }
  }

  // Tempo mark — rendered as Annotation on first note (not setTempo) so it stacks with chord symbols
  const tempoAnn = m.annotations.find((a) => a.kind === "tempo-mark") as TempoMark | undefined;

  stave.setContext(ctx.context).draw();

  // Draw stave-level annotations manually with coordinated Y tracking.
  // VexFlow handles note-level annotations (chord symbols, dynamics, lyrics) and
  // stave features (tempo, volta, segno/coda). We draw rehearsal marks and nav text
  // manually because VexFlow has no rehearsal mark class and StaveText doesn't
  // coordinate with tempo/volta positioning.
  //
  // Y tracker starts above VexFlow's stave elements and moves upward.
  const aboveStaveCtx = ctx.context as unknown as CanvasRenderingContext2D;
  let aboveY = y - 6; // just above stave top
  if (m.navigation?.volta) aboveY -= 22; // volta bracket takes ~22px
  if (m.navigation?.segno || m.navigation?.coda) aboveY -= 20; // segno/coda glyph

  // Rehearsal marks — boxed text (Dorico/MuseScore style)
  for (const ann of m.annotations) {
    if (ann.kind !== "rehearsal-mark") continue;
    if (!aboveStaveCtx.save) continue;
    aboveStaveCtx.save();
    aboveStaveCtx.font = "bold 14px sans-serif";
    const tw = aboveStaveCtx.measureText(ann.text).width;
    const pad = 4;
    const boxH = 14 + pad * 2;
    aboveY -= boxH + 2;
    aboveStaveCtx.strokeStyle = "#000";
    aboveStaveCtx.lineWidth = 1.5;
    aboveStaveCtx.beginPath();
    aboveStaveCtx.rect(x + 2 - pad, aboveY, tw + pad * 2, boxH);
    aboveStaveCtx.stroke();
    aboveStaveCtx.fillStyle = "#000";
    aboveStaveCtx.fillText(ann.text, x + 2, aboveY + boxH - pad - 2);
    aboveStaveCtx.restore();
  }

  // Navigation text (Fine, D.S., D.C., To Coda) — italic, right-aligned
  if (m.navigation && aboveStaveCtx.save) {
    const nav = m.navigation;
    const textItems: string[] = [];
    if (nav.fine) textItems.push("Fine");
    if (nav.toCoda) textItems.push("To Coda");
    if (nav.dsText) textItems.push(nav.dsText);
    if (nav.dcText) textItems.push(nav.dcText);
    if (textItems.length > 0) {
      aboveStaveCtx.save();
      aboveStaveCtx.font = "italic bold 11px serif";
      aboveStaveCtx.fillStyle = "#000";
      let navY = y - 6;
      if (m.navigation?.volta) navY -= 22;
      for (const text of textItems) {
        navY -= 14;
        // Measure text width and position so the right edge stays within the measure
        const tw = aboveStaveCtx.measureText(text).width;
        const navX = x + width - tw - 8;
        aboveStaveCtx.fillText(text, navX, navY + 12);
      }
      aboveStaveCtx.restore();
    }
  }

  const noteBoxes: NoteBox[] = [];
  const vfVoices: Voice[] = [];
  const allBeams: Beam[] = [];
  const allTuplets: VexTuplet[] = [];

  // Build VexFlow voices for all model voices that have events
  const activeVoiceCount = m.voices.filter(v => v && v.events.length > 0).length;
  const multiVoice = activeVoiceCount > 1;
  for (let vi = 0; vi < m.voices.length; vi++) {
    const modelVoice = m.voices[vi];
    if (!modelVoice || modelVoice.events.length === 0) continue;

    const stemDir = voiceStemDirection(vi, multiVoice);
    const staveNotes: StaveNote[] = [];
    const eventIds: NoteEventId[] = [];
    let pendingGraceNotes: VexGraceNote[] = [];
    let pendingGraceIds: NoteEventId[] = [];
    const graceNoteMap: { graceNotes: VexGraceNote[]; ids: NoteEventId[] }[] = [];

    for (const event of modelVoice.events) {
      if (event.kind === "grace") {
        pendingGraceNotes.push(eventToGraceNote(event));
        pendingGraceIds.push(event.id);
        continue;
      }
      const sn = eventToStaveNote(event, stemDir, CLEF_VEX[m.clef.type]);
      if (sn) {
        if (pendingGraceNotes.length > 0) {
          const graceGroup = new GraceNoteGroup(pendingGraceNotes, true);
          sn.addModifier(graceGroup);
          graceNoteMap.push({ graceNotes: pendingGraceNotes, ids: pendingGraceIds });
          pendingGraceNotes = [];
          pendingGraceIds = [];
        }

        // Attach annotations as VexFlow modifiers — order matters for stacking.
        // TOP: chord symbols (closest to staff), then tempo mark (above chords)
        // BOTTOM: dynamics first (closest to staff), then lyrics
        for (const ann of m.annotations) {
          if (ann.kind === "chord-symbol" && ann.noteEventId === event.id) {
            sn.addModifier(new VexAnnotation(ann.text)
              .setVerticalJustification(VexAnnotation.VerticalJustify.TOP)
              .setFont("sans-serif", style.chordSymbolSize, "bold"));
          }
        }
        // Tempo mark on first note only (above chord symbols)
        if (tempoAnn && staveNotes.length === 0) {
          const tempoText = tempoAnn.text
            ? `${tempoAnn.text} (♩= ${tempoAnn.bpm})`
            : `♩= ${tempoAnn.bpm}`;
          sn.addModifier(new VexAnnotation(tempoText)
            .setVerticalJustification(VexAnnotation.VerticalJustify.TOP)
            .setFont("serif", 12, "bold"));
        }
        // Dynamics as VexFlow Annotation (note-relative Y is correct for dynamics)
        for (const ann of m.annotations) {
          if (ann.kind === "dynamic" && ann.noteEventId === event.id) {
            sn.addModifier(new VexAnnotation(ann.level)
              .setVerticalJustification(VexAnnotation.VerticalJustify.BOTTOM)
              .setFont("serif", 16, "bold", "italic"));
          }
        }
        // Lyrics are drawn manually at stave-relative Y (see below)

        staveNotes.push(sn);
        eventIds.push(event.id);
      }
    }

    if (staveNotes.length > 0) {
      const totalTicks = modelVoice.events.reduce((sum, e) => {
        return sum + durationToTicksFn(e.duration, e.tuplet);
      }, 0);
      const capacity = measureCapacityFn(m.timeSignature.numerator, m.timeSignature.denominator);
      const beats = Math.max(totalTicks, capacity) / 480;

      const vfVoice = new Voice({
        numBeats: beats,
        beatValue: 4,
      }).setStrict(false);
      vfVoice.addTickables(staveNotes);

      // Pad with ghost notes so all voices have the same total ticks
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

      vfVoices.push(vfVoice);

      // Compute beam groups — filter out grace notes since they aren't in staveNotes
      const nonGraceEvents = modelVoice.events.filter((e) => e.kind !== "grace");
      const beamGroups = getBeamGroups(nonGraceEvents, m.timeSignature);
      for (const group of beamGroups) {
        const beamNotes = group.map((idx) => staveNotes[idx]);
        if (beamNotes.length >= 2) {
          try {
            allBeams.push(new Beam(beamNotes));
          } catch {
            // If VexFlow rejects the beam (e.g. incompatible notes), skip it
          }
        }
      }

      // Detect tuplet groups: consecutive events with matching tuplet fields
      let tupletStart = -1;
      for (let ei = 0; ei <= modelVoice.events.length; ei++) {
        const event = ei < modelVoice.events.length ? modelVoice.events[ei] : null;
        const tuplet = event?.tuplet;

        if (tupletStart >= 0) {
          const prevTuplet = modelVoice.events[tupletStart].tuplet!;
          const matches = tuplet && tuplet.actual === prevTuplet.actual && tuplet.normal === prevTuplet.normal;
          if (!matches) {
            // End of a tuplet group
            const tupletNotes = staveNotes.slice(tupletStart, ei);
            if (tupletNotes.length >= 2) {
              try {
                allTuplets.push(new VexTuplet(tupletNotes, {
                  numNotes: prevTuplet.actual,
                  notesOccupied: prevTuplet.normal,
                }));
              } catch {
                // VexFlow may reject if notes are incompatible
              }
            }
            tupletStart = tuplet ? ei : -1;
          }
        } else if (tuplet) {
          tupletStart = ei;
        }
      }

      // Store staveNotes + eventIds + voiceIndex for bounding box collection after draw
      const meta = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number; __graceNoteMap: typeof graceNoteMap };
      meta.__staveNotes = staveNotes;
      meta.__eventIds = eventIds;
      meta.__voiceIndex = vi;
      meta.__graceNoteMap = graceNoteMap;
    }
  }

  // Format and draw all voices together
  if (vfVoices.length > 0) {
    const formatter = new Formatter();
    try {
      formatter.joinVoices(vfVoices);
    } catch {
      // Voices have mismatched tick totals — join each independently so rendering doesn't crash
      for (const v of vfVoices) {
        try { formatter.joinVoices([v]); } catch { /* skip broken voice */ }
      }
    }

    // Use proportional spacing via softmax factor scaled by stylesheet spacingFactor
    const formattingWidth = width - (stave.getNoteStartX() - x) - 10;
    try {
      formatter.format(vfVoices, formattingWidth * style.spacingFactor);
    } catch {
      // Tick mismatch in format — format each voice independently
      for (const v of vfVoices) {
        try {
          const f = new Formatter();
          f.joinVoices([v]);
          f.format([v], formattingWidth * style.spacingFactor);
        } catch { /* skip broken voice */ }
      }
    }

    for (const vfVoice of vfVoices) {
      // Color active playback notes
      if (activeNoteIds?.size) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
        data.__staveNotes.forEach((sn, idx) => {
          if (activeNoteIds.has(data.__eventIds[idx])) {
            sn.setStyle({ fillStyle: "#4a7dff", strokeStyle: "#4a7dff" });
          }
        });
      }

      vfVoice.draw(ctx.context, stave);

      // Collect bounding boxes
      const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number; __graceNoteMap: { graceNotes: VexGraceNote[]; ids: NoteEventId[] }[] };
      data.__staveNotes.forEach((sn, idx) => {
        const bb = sn.getBoundingBox();
        if (bb) {
          // Full bounding box for hit testing (includes grace notes etc.)
          const x = bb.getX(), y = bb.getY(), w = bb.getW(), h = bb.getH();
          // Tighter note head bounds for visual highlights
          const nhX = sn.getNoteHeadBeginX();
          const nhEndX = sn.getNoteHeadEndX();
          const nhWidth = nhEndX - nhX;
          let headY = y, headH = h;
          try {
            const nhBounds = sn.getNoteHeadBounds();
            if (nhBounds.yTop != null && nhBounds.yBottom != null) {
              headY = nhBounds.yTop;
              headH = nhBounds.yBottom - nhBounds.yTop;
            }
          } catch { /* pre-render or missing stave */ }
          noteBoxes.push({
            id: data.__eventIds[idx],
            x, y, width: w, height: h,
            headX: nhWidth > 0 ? nhX : x,
            headY,
            headWidth: nhWidth > 0 ? nhWidth : w,
            headHeight: Math.max(headH, 10),
            partIndex,
            measureIndex,
            voiceIndex: data.__voiceIndex,
            eventIndex: idx,
          });
        }
      });

      // Collect bounding boxes for grace notes
      for (const { graceNotes, ids } of data.__graceNoteMap) {
        graceNotes.forEach((gn, gi) => {
          try {
            const gbb = gn.getBoundingBox();
            if (gbb) {
              const gx = gbb.getX(), gy = gbb.getY(), gw = gbb.getW(), gh = gbb.getH();
              noteBoxes.push({
                id: ids[gi],
                x: gx, y: gy, width: gw, height: gh,
                headX: gx, headY: gy, headWidth: gw, headHeight: Math.max(gh, 10),
                partIndex,
                measureIndex,
                voiceIndex: data.__voiceIndex,
                eventIndex: -1, // grace notes don't have a staveNote index
              });
            }
          } catch { /* grace note may not have position info */ }
        });
      }
    }

    // Draw beams after voices
    for (const beam of allBeams) {
      beam.setContext(ctx.context).draw();
    }

    // Draw tuplet brackets after beams
    for (const tuplet of allTuplets) {
      tuplet.setContext(ctx.context).draw();
    }

    // Draw ties between consecutive tied notes within each voice
    for (let vi = 0; vi < m.voices.length; vi++) {
      const modelVoice = m.voices[vi];
      if (!modelVoice || modelVoice.events.length === 0) continue;

      // Find the matching vfVoice for this voice index
      const vfVoice = vfVoices.find((v) => {
        const meta = v as unknown as { __voiceIndex: number };
        return meta.__voiceIndex === vi;
      });
      if (!vfVoice) continue;

      const staveNotes = (vfVoice as unknown as { __staveNotes: StaveNote[] }).__staveNotes;
      const events = modelVoice.events;

      for (let i = 0; i < events.length - 1; i++) {
        const ev = events[i];
        if (ev.kind === "note" && ev.head.tied) {
          new StaveTie({
            firstNote: staveNotes[i],
            lastNote: staveNotes[i + 1],
          }).setContext(ctx.context).draw();
        } else if (ev.kind === "chord") {
          // For chords, check each head individually
          const tiedIndices = ev.heads
            .map((h, idx) => (h.tied ? idx : -1))
            .filter((idx) => idx >= 0);
          if (tiedIndices.length > 0) {
            for (const headIdx of tiedIndices) {
              new StaveTie({
                firstNote: staveNotes[i],
                lastNote: staveNotes[i + 1],
                firstIndexes: [headIdx],
                lastIndexes: [headIdx],
              }).setContext(ctx.context).draw();
            }
          }
        }
      }
    }

    // Draw slurs for same-measure slur annotations
    for (const annotation of m.annotations) {
      if (annotation.kind !== "slur") continue;

      let startNote: StaveNote | null = null;
      let endNote: StaveNote | null = null;

      for (const vfVoice of vfVoices) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number };
        for (let idx = 0; idx < data.__eventIds.length; idx++) {
          if (data.__eventIds[idx] === annotation.startEventId) startNote = data.__staveNotes[idx];
          if (data.__eventIds[idx] === annotation.endEventId) endNote = data.__staveNotes[idx];
        }
      }

      if (startNote && endNote) {
        try {
          new StaveTie({
            firstNote: startNote,
            lastNote: endNote,
          }).setContext(ctx.context).draw();
        } catch {
          // VexFlow may reject in edge cases; skip gracefully
        }
      }
    }

    // Draw hairpins using VexFlow StaveHairpin
    for (const annotation of m.annotations) {
      if (annotation.kind !== "hairpin") continue;
      let startNote: StaveNote | null = null;
      let endNote: StaveNote | null = null;
      for (const vfVoice of vfVoices) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
        for (let idx = 0; idx < data.__eventIds.length; idx++) {
          if (data.__eventIds[idx] === annotation.startEventId) startNote = data.__staveNotes[idx];
          if (data.__eventIds[idx] === annotation.endEventId) endNote = data.__staveNotes[idx];
        }
      }
      if (startNote && endNote) {
        try {
          const hpType = annotation.type === "crescendo" ? StaveHairpin.type.CRESC : StaveHairpin.type.DECRESC;
          const hp = new StaveHairpin({ firstNote: startNote, lastNote: endNote }, hpType);
          hp.setPosition(4); // BELOW
          // Push hairpin below dynamics if present in same measure
          const dynShift = m.annotations.some((a) => a.kind === "dynamic") ? 25 : 0;
          hp.setRenderOptions({ leftShiftPx: 0, rightShiftPx: 0, height: 10, yShift: dynShift });
          hp.setContext(ctx.context).draw();
        } catch { /* skip */ }
      }
    }
  }

  // All annotations are now rendered by VexFlow — no manual canvas drawing.
  // Collect annotation boxes for interactive editing (chord symbols, lyrics).
  const annotationBoxes: AnnotationBox[] = [];
  for (const annotation of m.annotations) {
    if (annotation.kind === "chord-symbol") {
      const box = annotation.noteEventId ? noteBoxes.find((nb) => nb.id === annotation.noteEventId) : undefined;
      if (box) {
        annotationBoxes.push({
          kind: "chord-symbol",
          x: box.x, y: box.y - style.chordSymbolSize - 4,
          width: box.width, height: style.chordSymbolSize + 4,
          partIndex, measureIndex,
          noteEventId: annotation.noteEventId, text: annotation.text,
        });
      }
    }
    if (annotation.kind === "lyric") {
      const box = noteBoxes.find((nb) => nb.id === annotation.noteEventId);
      if (box) {
        annotationBoxes.push({
          kind: "lyric",
          x: box.x, y: stave.getBottomY() + 10,
          width: box.width, height: style.lyricSize + 4,
          partIndex, measureIndex,
          noteEventId: annotation.noteEventId, text: annotation.text,
        });
      }
    }
  }

  // Lyrics — drawn manually at stave-relative Y for consistent positioning.
  // Dynamics are VexFlow Annotations (note-relative, which is correct for dynamics).
  // Lyrics go below dynamics at a fixed distance from stave bottom.
  {
    const lyricAnnotations = m.annotations.filter((a) => a.kind === "lyric");
    if (lyricAnnotations.length > 0) {
      const lCtx = ctx.context as unknown as CanvasRenderingContext2D;
      if (lCtx.save) {
        // Fixed offset from stave bottom — consistent across all measures.
        // Always reserve space for dynamics and hairpins so lyrics align globally.
        const lyricBaseY = stave.getBottomY() + 50;

        lCtx.save();
        lCtx.font = `italic ${style.lyricSize}px ${style.fontFamily}`;
        lCtx.fillStyle = "#555";
        lCtx.textAlign = "center";
        for (const ann of lyricAnnotations) {
          if (ann.kind !== "lyric") continue;
          const box = noteBoxes.find((nb) => nb.id === ann.noteEventId);
          if (!box) continue;
          const lyricText = ann.syllableType === "begin" || ann.syllableType === "middle"
            ? ann.text + "-" : ann.text;
          const verseOffset = ((ann.verseNumber || 1) - 1) * (style.lyricSize + 4);
          const lyricX = box.x + box.width / 2;
          const lyricY = lyricBaseY + verseOffset;
          const lyricMetrics = lCtx.measureText(lyricText);
          lCtx.fillText(lyricText, lyricX, lyricY);
          annotationBoxes.push({
            kind: "lyric",
            x: lyricX - lyricMetrics.width / 2,
            y: lyricY - style.lyricSize,
            width: lyricMetrics.width,
            height: style.lyricSize + 4,
            partIndex, measureIndex,
            noteEventId: ann.noteEventId, text: ann.text,
          });
        }
        lCtx.textAlign = "start";
        lCtx.restore();
      }
    }
  }

  // Show overfill/underfill indicator (MuseScore-style + or –)
  const capacity = measureCapacityFn(m.timeSignature.numerator, m.timeSignature.denominator);
  const maxTicks = Math.max(...m.voices.map((v) => voiceTicksUsedFn(v.events)), 0);
  if (maxTicks > 0 && maxTicks !== capacity) {
    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.save) {
      rawCtx.save();
      const isOver = maxTicks > capacity;
      rawCtx.fillStyle = isOver ? "#ef4444" : "#f59e0b";
      rawCtx.font = "bold 12px sans-serif";
      rawCtx.textAlign = "right";
      rawCtx.fillText(isOver ? "+" : "\u2013", x + width - 3, y + 10);
      rawCtx.textAlign = "start";
      rawCtx.restore();
    }
  }

  return {
    noteBoxes,
    annotationBoxes,
    staveY: y,
    staveX: x,
    width,
  };
}

/**
 * Render a system barline connecting all staves vertically.
 */
export function renderSystemBarline(
  ctx: RenderContext,
  x: number,
  topY: number,
  bottomY: number
): void {
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.save) {
    rawCtx.save();
    rawCtx.strokeStyle = "#000";
    rawCtx.lineWidth = 1.5;
    rawCtx.beginPath();
    rawCtx.moveTo(x, topY);
    rawCtx.lineTo(x, bottomY);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

/**
 * Render a brace for grand staff instruments (e.g., piano).
 */
export function renderBrace(
  ctx: RenderContext,
  x: number,
  topY: number,
  bottomY: number
): void {
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.save) {
    rawCtx.save();
    rawCtx.strokeStyle = "#000";
    rawCtx.lineWidth = 2;
    const midY = (topY + bottomY) / 2;
    const height = bottomY - topY;
    // Draw a simple curly brace using bezier curves
    rawCtx.beginPath();
    rawCtx.moveTo(x, topY);
    rawCtx.bezierCurveTo(x - 8, topY + height * 0.25, x - 8, midY - 5, x - 3, midY);
    rawCtx.bezierCurveTo(x - 8, midY + 5, x - 8, topY + height * 0.75, x, bottomY);
    rawCtx.stroke();
    rawCtx.restore();
  }
}

/**
 * Render a multi-measure rest: a single wide stave with a thick horizontal bar and count.
 */
export function renderMultiMeasureRest(
  ctx: RenderContext,
  m: Measure,
  x: number,
  y: number,
  width: number,
  numberOfMeasures: number,
  showClef: boolean,
  showKeySig: boolean,
): MeasureRenderResult {
  const stave = new Stave(x, y, width);
  if (showClef) stave.addClef(CLEF_VEX[m.clef.type] || "treble");
  if (showKeySig) {
    const keySig = KEY_SIG_MAP[m.keySignature.fifths] ?? "C";
    stave.addKeySignature(keySig);
  }
  stave.setContext(ctx.context).draw();

  const mmr = new MultiMeasureRest(numberOfMeasures, {
    numberOfMeasures,
    showNumber: true,
  });
  mmr.setStave(stave);
  mmr.setContext(ctx.context as unknown as import("vexflow").RenderContext);
  mmr.draw();

  return { noteBoxes: [], annotationBoxes: [], staveY: y, staveX: x, width };
}

export function clearCanvas(ctx: RenderContext, canvas: HTMLCanvasElement): void {
  ctx.context.clearRect(0, 0, canvas.width, canvas.height);
}
