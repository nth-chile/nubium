import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, Beam, StaveConnector, Barline, Repetition, Volta as VexVolta, StaveTie, MultiMeasureRest, Tuplet as VexTuplet, Articulation as VexArticulation, Ornament as VexOrnament, GraceNote as VexGraceNote, GraceNoteGroup } from "vexflow";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { BarlineType } from "../model/time";
import type { Annotation } from "../model/annotations";
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
  fermata: "afermata",
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
  stemDirection?: "up" | "down"
): StaveNote | null {
  switch (event.kind) {
    case "note": {
      const key = pitchToVexKey(event.head.pitch);
      const dur = DUR_VEX[event.duration.type];
      const opts: { keys: string[]; duration: string; stemDirection?: number } = {
        keys: [key],
        duration: dur,
      };
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
      const opts: { keys: string[]; duration: string; stemDirection?: number } = {
        keys,
        duration: dur,
      };
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
      const sn = new StaveNote({ keys: ["b/4"], duration: dur });
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

/** Stem direction per voice index: 0=auto (undefined), 1=up, 2=down */
function voiceStemDirection(voiceIndex: number): "up" | "down" | undefined {
  if (voiceIndex === 1) return "up";
  if (voiceIndex === 2) return "down";
  return undefined;
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

  stave.setContext(ctx.context).draw();

  const noteBoxes: NoteBox[] = [];
  const vfVoices: Voice[] = [];
  const allBeams: Beam[] = [];
  const allTuplets: VexTuplet[] = [];

  // Build VexFlow voices for all model voices that have events
  for (let vi = 0; vi < m.voices.length; vi++) {
    const modelVoice = m.voices[vi];
    if (!modelVoice || modelVoice.events.length === 0) continue;

    const stemDir = voiceStemDirection(vi);
    const staveNotes: StaveNote[] = [];
    const eventIds: NoteEventId[] = [];
    let pendingGraceNotes: VexGraceNote[] = [];

    for (const event of modelVoice.events) {
      if (event.kind === "grace") {
        pendingGraceNotes.push(eventToGraceNote(event));
        continue;
      }
      const sn = eventToStaveNote(event, stemDir);
      if (sn) {
        if (pendingGraceNotes.length > 0) {
          const graceGroup = new GraceNoteGroup(pendingGraceNotes, true);
          sn.addModifier(graceGroup);
          pendingGraceNotes = [];
        }
        staveNotes.push(sn);
        eventIds.push(event.id);
      }
    }

    if (staveNotes.length > 0) {
      const totalTicks = modelVoice.events.reduce((sum, e) => {
        return sum + durationToTicksFn(e.duration, e.tuplet);
      }, 0);
      const beats = totalTicks / 480;

      const vfVoice = new Voice({
        numBeats: beats,
        beatValue: 4,
      }).setStrict(false);
      vfVoice.addTickables(staveNotes);
      vfVoices.push(vfVoice);

      // Compute beam groups for this voice
      const beamGroups = getBeamGroups(modelVoice.events, m.timeSignature);
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
      const meta = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number };
      meta.__staveNotes = staveNotes;
      meta.__eventIds = eventIds;
      meta.__voiceIndex = vi;
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
      const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number };
      data.__staveNotes.forEach((sn, idx) => {
        const bb = sn.getBoundingBox();
        if (bb) {
          noteBoxes.push({
            id: data.__eventIds[idx],
            x: bb.getX(),
            y: bb.getY(),
            width: bb.getW(),
            height: bb.getH(),
            partIndex,
            measureIndex,
            voiceIndex: data.__voiceIndex,
            eventIndex: idx,
          });
        }
      });
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
  }

  // Render annotations (chord symbols above, lyrics below, rehearsal marks, tempo marks)
  const annotationBoxes: AnnotationBox[] = [];
  if (m.annotations.length > 0) {
    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.save) {
      for (const annotation of m.annotations) {
        switch (annotation.kind) {
          case "chord-symbol": {
            const box = annotation.noteEventId
              ? noteBoxes.find((nb) => nb.id === annotation.noteEventId)
              : undefined;
            if (!box) break;
            rawCtx.save();
            const chordFont = `bold ${style.chordSymbolSize}px sans-serif`;
            rawCtx.font = chordFont;
            rawCtx.fillStyle = "#333";
            const textMetrics = rawCtx.measureText(annotation.text);
            const textX = box.x;
            const textY = y + 10;
            rawCtx.fillText(annotation.text, textX, textY);
            rawCtx.restore();
            annotationBoxes.push({
              kind: "chord-symbol",
              x: textX,
              y: textY - style.chordSymbolSize,
              width: textMetrics.width,
              height: style.chordSymbolSize + 4,
              partIndex,
              measureIndex,
              noteEventId: annotation.noteEventId,
              text: annotation.text,
            });
            break;
          }
          case "lyric": {
            // Skip lyric rendering when lyrics are disabled
            if (!useEditorStore.getState().showLyrics) break;
            // Find matching noteBox by noteEventId
            const box = noteBoxes.find((nb) => nb.id === annotation.noteEventId);
            if (box) {
              rawCtx.save();
              const lyricFont = `italic ${style.lyricSize}px ${style.fontFamily}`;
              rawCtx.font = lyricFont;
              rawCtx.fillStyle = "#555";
              rawCtx.textAlign = "center";
              const lyricText =
                annotation.syllableType === "begin" || annotation.syllableType === "middle"
                  ? annotation.text + "-"
                  : annotation.text;
              const lyricX = box.x + box.width / 2;
              const lyricY = y + 105;
              const lyricMetrics = rawCtx.measureText(lyricText);
              rawCtx.fillText(lyricText, lyricX, lyricY);
              rawCtx.textAlign = "start";
              rawCtx.restore();
              annotationBoxes.push({
                kind: "lyric",
                x: lyricX - lyricMetrics.width / 2,
                y: lyricY - style.lyricSize,
                width: lyricMetrics.width,
                height: style.lyricSize + 4,
                partIndex,
                measureIndex,
                noteEventId: annotation.noteEventId,
                text: annotation.text,
              });
            }
            break;
          }
          case "rehearsal-mark": {
            rawCtx.save();
            rawCtx.font = "bold 14px sans-serif";
            rawCtx.fillStyle = "#000";
            const textWidth = rawCtx.measureText(annotation.text).width;
            const boxPadding = 4;
            rawCtx.strokeStyle = "#000";
            rawCtx.lineWidth = 1.5;
            rawCtx.beginPath();
            rawCtx.rect(
              x + 2 - boxPadding,
              y - 6 - boxPadding,
              textWidth + boxPadding * 2,
              14 + boxPadding * 2
            );
            rawCtx.stroke();
            rawCtx.fillText(annotation.text, x + 2, y + 6);
            rawCtx.restore();
            break;
          }
          case "tempo-mark": {
            rawCtx.save();
            rawCtx.fillStyle = "#000";
            const noteGlyph: Record<string, string> = {
              whole: "o", half: "d", quarter: "♩",
              eighth: "♪", "16th": "♬", "32nd": "♬",
            };
            const glyph = noteGlyph[annotation.beatUnit] ?? annotation.beatUnit;
            const tempoText = annotation.text ? `${annotation.text} (${glyph} = ${annotation.bpm})` : `${glyph} = ${annotation.bpm}`;
            rawCtx.font = "bold 12px sans-serif";
            rawCtx.fillText(tempoText, x + 2, y - 4);
            rawCtx.restore();
            break;
          }
          case "dynamic": {
            // Find the StaveNote attached to this dynamic via noteEventId
            const box = noteBoxes.find((nb) => nb.id === annotation.noteEventId);
            if (box) {
              rawCtx.save();
              rawCtx.font = "italic bold 16px serif";
              rawCtx.fillStyle = "#000";
              rawCtx.textAlign = "center";
              rawCtx.fillText(annotation.level, box.x + box.width / 2, y + 75);
              rawCtx.textAlign = "start";
              rawCtx.restore();
            }
            break;
          }
          case "hairpin": {
            // Draw a wedge (crescendo or diminuendo) between start and end notes
            const startBox = noteBoxes.find((nb) => nb.id === annotation.startEventId);
            const endBox = noteBoxes.find((nb) => nb.id === annotation.endEventId);
            if (startBox && endBox) {
              rawCtx.save();
              rawCtx.strokeStyle = "#000";
              rawCtx.lineWidth = 1.5;
              const hairpinY = y + 75;
              const spread = 5; // half-height of the wedge opening
              const startX = startBox.x + startBox.width;
              const endX = endBox.x;
              rawCtx.beginPath();
              if (annotation.type === "crescendo") {
                // Two lines diverging from left to right: < shape
                rawCtx.moveTo(startX, hairpinY);
                rawCtx.lineTo(endX, hairpinY - spread);
                rawCtx.moveTo(startX, hairpinY);
                rawCtx.lineTo(endX, hairpinY + spread);
              } else {
                // Two lines converging from left to right: > shape
                rawCtx.moveTo(startX, hairpinY - spread);
                rawCtx.lineTo(endX, hairpinY);
                rawCtx.moveTo(startX, hairpinY + spread);
                rawCtx.lineTo(endX, hairpinY);
              }
              rawCtx.stroke();
              rawCtx.restore();
            }
            break;
          }
        }
      }
    }
  }

  // Render navigation text marks (D.S., D.C., To Coda, Fine)
  if (m.navigation) {
    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.save) {
      const nav = m.navigation;
      const textItems: string[] = [];
      if (nav.dsText) textItems.push(nav.dsText);
      if (nav.dcText) textItems.push(nav.dcText);
      if (nav.toCoda) textItems.push("To Coda \uD834\uDD21");
      if (nav.fine) textItems.push("Fine");

      if (textItems.length > 0) {
        rawCtx.save();
        rawCtx.font = "italic bold 11px serif";
        rawCtx.fillStyle = "#000";
        rawCtx.textAlign = "right";
        let textY = y - 4;
        for (const text of textItems) {
          rawCtx.fillText(text, x + width - 4, textY);
          textY -= 14;
        }
        rawCtx.textAlign = "start";
        rawCtx.restore();
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
