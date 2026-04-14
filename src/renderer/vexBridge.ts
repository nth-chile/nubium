import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, Beam, StaveConnector, Barline, Repetition, Volta as VexVolta, StaveTie, StaveHairpin, MultiMeasureRest, Tuplet as VexTuplet, Articulation as VexArticulation, Ornament as VexOrnament, Annotation as VexAnnotation, GraceNote as VexGraceNote, GraceNoteGroup, GhostNote, Tremolo } from "vexflow";
import type { Measure, NoteEvent, NoteEventId } from "../model";
import type { BarlineType } from "../model/time";
import type { TempoMark } from "../model/annotations";
import { isCrossStaff, type ArticulationKind } from "../model/note";
import type { Stylesheet } from "../model/stylesheet";
import { resolveStylesheet } from "../model/stylesheet";
import { durationToTicks as durationToTicksFn, measureCapacity as measureCapacityFn, voiceTicksUsed as voiceTicksUsedFn } from "../model/duration";
import { keyAccidental, pitchToMidi } from "../model/pitch";
import { getBeamGroups } from "./beaming";

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
  staveIndex?: number;
  /** Per-head hit rects for chord events, in the same order as event.heads. */
  heads?: { x: number; y: number; width: number; height: number }[];
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
  /** Map from event ID to VexFlow StaveNote — used for cross-measure tie/slur rendering */
  staveNoteMap: Map<NoteEventId, StaveNote>;
  /** The VexFlow Stave object — needed for cross-staff note rendering */
  vexStave: Stave;
}

const ACC_VEX: Record<string, string> = {
  natural: "n",
  sharp: "#",
  flat: "b",
  "double-sharp": "##",
  "double-flat": "bb",
};


/**
 * Collect accidentals that were applied in a measure (non-key-signature accidentals).
 * Returns a set of "PitchClass+Octave" strings (e.g., "F4", "C#5") that had altered accidentals.
 */
/**
 * Collect pitches whose LAST occurrence in the measure had a non-key-signature accidental.
 * If a pitch was altered then cancelled (F# then F♮), it's NOT included.
 */
function collectPrevMeasureAccidentals(measure: Measure): Set<string> {
  // Track the last-seen accidental for each pitch
  const lastSeen = new Map<string, import("../model/pitch").Accidental>();
  const fifths = measure.keySignature.fifths;
  for (const voice of measure.voices) {
    for (const event of voice.events) {
      if (event.kind === "note") {
        const { pitchClass, accidental, octave } = event.head.pitch;
        lastSeen.set(`${pitchClass}${octave}`, accidental);
      } else if (event.kind === "chord") {
        for (const h of event.heads) {
          const { pitchClass, accidental, octave } = h.pitch;
          lastSeen.set(`${pitchClass}${octave}`, accidental);
        }
      }
    }
  }
  const altered = new Set<string>();
  for (const [key, acc] of lastSeen) {
    const pc = key.slice(0, -1);
    if (acc !== keyAccidental(pc as import("../model/pitch").PitchClass, fifths)) {
      altered.add(key);
    }
  }
  return altered;
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

const ARTICULATION_VEX: Partial<Record<ArticulationKind, string>> = {
  staccato: "a.",
  staccatissimo: "av",
  accent: "a>",
  tenuto: "a-",
  fermata: "a@a",
  marcato: "a^",
  "up-bow": "a|",
  "down-bow": "am",
  "down-stroke": "am",
  "up-stroke": "a|",
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
      if (art.kind === "tremolo-picking") {
        sn.addModifier(new Tremolo(3));
        continue;
      }
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

export function initRenderer(canvas: HTMLCanvasElement, width?: number, height?: number, zoom: number = 1): RenderContext {
  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  // VexFlow's resize() handles DPR internally: sets canvas.width = w * dpr,
  // canvas.style.width = w + 'px', and applies scale(dpr, dpr).
  renderer.resize(w, h);
  if (zoom !== 1) {
    // Scale the display size and backing store by zoom, then apply a combined
    // setTransform so VexFlow's draw calls (at logical coords 0..w) render at
    // `w * zoom` display px. Content layout is unchanged — only rendering scales.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr * zoom);
    canvas.height = Math.round(h * dpr * zoom);
    canvas.style.width = `${w * zoom}px`;
    canvas.style.height = `${h * zoom}px`;
    const rawCtx = canvas.getContext("2d");
    if (rawCtx) rawCtx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  }
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
  prevAltered?: Set<string>,
  courtesyShown?: Set<string>,
  measureAltered?: Set<string>,
  fifths: number = 0,
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
      const { pitchClass: pc, octave: oct } = event.head.pitch;
      const pitchKey = `${pc}${oct}`;
      const keyDefault = keyAccidental(pc as import("../model/pitch").PitchClass, fifths);
      if (acc !== keyDefault) {
        // Accidental differs from key signature — show it
        sn.addModifier(new Accidental(ACC_VEX[acc]));
        measureAltered?.add(pitchKey);
      } else if (acc === keyDefault && measureAltered?.has(pitchKey)) {
        // Same-measure cancellation: show accidental to cancel a prior alteration
        sn.addModifier(new Accidental(ACC_VEX[acc]));
        measureAltered?.delete(pitchKey);
      } else if (acc === keyDefault && prevAltered?.has(pitchKey) && !courtesyShown?.has(pitchKey)) {
        // Cross-barline courtesy — cancel prev measure's alteration
        const ca = new Accidental(ACC_VEX[acc]);
        ca.setAsCautionary();
        sn.addModifier(ca);
        courtesyShown?.add(pitchKey);
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
        const { pitchClass: pc, octave: oct } = h.pitch;
        const pitchKey = `${pc}${oct}`;
        const keyDefault = keyAccidental(pc as import("../model/pitch").PitchClass, fifths);
        if (acc !== keyDefault) {
          sn.addModifier(new Accidental(ACC_VEX[acc]), idx);
          measureAltered?.add(pitchKey);
        } else if (acc === keyDefault && measureAltered?.has(pitchKey)) {
          sn.addModifier(new Accidental(ACC_VEX[acc]), idx);
          measureAltered?.delete(pitchKey);
        } else if (acc === keyDefault && prevAltered?.has(pitchKey) && !courtesyShown?.has(pitchKey)) {
          const ca = new Accidental(ACC_VEX[acc]);
          ca.setAsCautionary();
          sn.addModifier(ca, idx);
          courtesyShown?.add(pitchKey);
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

/**
 * Apply barline, volta, segno, coda, navigation text, tempo, and rehearsal marks to a stave.
 * Call applyStaveDecorations() BEFORE stave.draw() for volta/segno modifiers,
 * then drawStaveAnnotations() AFTER stave.draw() for text rendering.
 */
export function applyStaveDecorations(stave: Stave, m: Measure): void {
  if (m.navigation?.volta) {
    const volta = m.navigation.volta;
    const label = volta.label ?? volta.endings.join(", ") + ".";
    try { stave.setVoltaType(VexVolta.type.BEGIN, label, 25); } catch { /* skip */ }
  }

  if (m.navigation?.segno) {
    try { stave.addModifier(new Repetition(Repetition.type.SEGNO_LEFT, stave.getX() - 15, 0)); } catch { /* skip */ }
  }
}

/**
 * Draw above-stave annotations: coda, navigation text, tempo, rehearsal marks.
 * Call AFTER stave.draw().
 */
export function drawStaveAnnotations(
  ctx: RenderContext,
  stave: Stave,
  m: Measure,
  x: number,
  y: number,
  width: number
): void {
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (!rawCtx.save) return;

  // Coda symbol
  if (m.navigation?.coda) {
    rawCtx.save();
    rawCtx.font = "28px Bravura, Petaluma, serif";
    rawCtx.fillStyle = "#000";
    rawCtx.fillText("\uE048", x - 10, y - 28);
    rawCtx.restore();
  }

  let aboveY = y - 6;

  if (m.navigation?.volta) aboveY -= 22;
  if (m.navigation?.segno || m.navigation?.coda) aboveY -= 35;

  // Navigation text (Fine, D.S., D.C., To Coda)
  if (m.navigation) {
    const nav = m.navigation;
    const textItems: string[] = [];
    if (nav.fine) textItems.push("Fine");
    if (nav.toCoda) textItems.push("To Coda");
    if (nav.dsText) textItems.push(nav.dsText);
    if (nav.dcText) textItems.push(nav.dcText);
    if (textItems.length > 0) {
      rawCtx.save();
      rawCtx.font = "italic bold 11px serif";
      rawCtx.fillStyle = "#000";
      let navY = aboveY;
      for (const text of textItems) {
        navY -= 14;
        const tw = rawCtx.measureText(text).width;
        rawCtx.fillText(text, x + width - tw - 8, navY + 12);
      }
      rawCtx.restore();
      if (navY < aboveY) aboveY = navY;
    }
  }

  // Tempo mark
  const tempoAnn = m.annotations.find((a) => a.kind === "tempo-mark") as import("../model/annotations").TempoMark | undefined;
  if (tempoAnn) {
    rawCtx.save();
    rawCtx.font = "bold 12px serif";
    rawCtx.fillStyle = "#000";
    const tempoText = tempoAnn.text
      ? `${tempoAnn.text} (\u2669 = ${tempoAnn.bpm})`
      : `\u2669 = ${tempoAnn.bpm}`;
    aboveY -= 22;
    rawCtx.fillText(tempoText, stave.getNoteStartX() + 10, aboveY + 14);
    rawCtx.restore();
  }

  // Rehearsal marks — boxed text
  for (const ann of m.annotations) {
    if (ann.kind !== "rehearsal-mark") continue;
    rawCtx.save();
    rawCtx.font = "bold 20px sans-serif";
    const tw = rawCtx.measureText(ann.text).width;
    const pad = 6;
    const boxSize = Math.max(tw + pad * 2, 20 + pad * 2);
    aboveY -= boxSize + 2;
    rawCtx.strokeStyle = "#000";
    rawCtx.lineWidth = 2;
    rawCtx.beginPath();
    const rehX = stave.getNoteStartX() + 10;
    rawCtx.rect(rehX - pad, aboveY, boxSize, boxSize);
    rawCtx.stroke();
    rawCtx.fillStyle = "#000";
    rawCtx.fillText(ann.text, rehX + (boxSize - pad * 2 - tw) / 2, aboveY + boxSize / 2 + 7);
    rawCtx.restore();
  }
}

export function applyBarline(stave: Stave, barlineType: BarlineType): void {
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

/** Create a bare VexFlow Stave for pre-creation (used by cross-staff rendering). */
export function createVexStave(
  _ctx: RenderContext,
  m: Measure,
  x: number,
  y: number,
  width: number,
  showClef: boolean,
  showTimeSig: boolean,
  showKeySig: boolean,
  prevKeySigFifths?: number,
): Stave {
  const stave = new Stave(x, y, width);
  if (showClef) stave.addClef(CLEF_VEX[m.clef.type] || "treble");
  if (showKeySig) {
    const keySig = KEY_SIG_MAP[m.keySignature.fifths] ?? "C";
    const cancelKey = prevKeySigFifths !== undefined && prevKeySigFifths !== m.keySignature.fifths
      ? KEY_SIG_MAP[prevKeySigFifths] ?? "C"
      : undefined;
    stave.addKeySignature(keySig, cancelKey);
  }
  if (showTimeSig) {
    stave.addTimeSignature(`${m.timeSignature.numerator}/${m.timeSignature.denominator}`);
  }
  return stave;
}

export interface RenderMeasureOptions {
  stylesheet?: Partial<Stylesheet>;
  partIndex?: number;
  measureIndex?: number;
  activeNoteIds?: Set<NoteEventId>;
  /** Notes to render in the selection color (not as strong as playback-active — applied via StaveNote.setStyle). */
  selectedNoteIds?: Set<NoteEventId>;
  /** When set, only the specified head index of the chord is styled instead of the whole note. */
  selectedHeadByEventId?: Map<NoteEventId, number>;
  prevMeasure?: Measure;
  voiceFilter?: number[];
  staveIndex?: number;
  crossStaffStave?: Stave;
  crossStaffClef?: string;
  /** Instrument range (MIDI). Notes outside are highlighted as out-of-range. */
  instrumentMinPitch?: number;
  instrumentMaxPitch?: number;
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
  opts: RenderMeasureOptions = {},
): MeasureRenderResult {
  const {
    stylesheet, partIndex = 0, measureIndex = 0, activeNoteIds,
    selectedNoteIds, selectedHeadByEventId,
    prevMeasure, voiceFilter, staveIndex = 0, crossStaffStave, crossStaffClef,
    instrumentMinPitch, instrumentMaxPitch,
  } = opts;
  const style = resolveStylesheet(stylesheet);

  // Accidentals from previous measure for courtesy accidental detection
  const prevAltered = prevMeasure ? collectPrevMeasureAccidentals(prevMeasure) : new Set<string>();
  const courtesyShown = new Set<string>(); // track which pitches already got a courtesy this measure
  const measureAltered = new Set<string>(); // track pitches altered so far within this measure

  const stave = createVexStave(ctx, m, x, y, width, showClef, showTimeSig, showKeySig, prevMeasure?.keySignature.fifths);

  // Set barline types
  applyBarline(stave, m.barlineEnd);

  // Secondary stave = any stave after the first in a grand staff instrument
  const isSecondaryStaveLocal = voiceFilter != null && staveIndex > 0;

  // Add volta bracket if present (treble only)
  if (m.navigation?.volta && !isSecondaryStaveLocal) {
    const volta = m.navigation.volta;
    const label = volta.label ?? volta.endings.join(", ") + ".";
    try {
      stave.setVoltaType(VexVolta.type.BEGIN, label, 25);
    } catch {
      // VexFlow may not support this in all versions; fall back to text
    }
  }

  // Segno — VexFlow Repetition, shifted up past chord symbols
  const hasChords = !isSecondaryStaveLocal && m.annotations.some((a) => a.kind === "chord-symbol");
  if (m.navigation?.segno && !isSecondaryStaveLocal) {
    const segnoShift = hasChords ? -(style.chordSymbolSize + 8) : 0;
    try { stave.addModifier(new Repetition(Repetition.type.SEGNO_LEFT, x - 15, segnoShift)); } catch { /* skip */ }
  }
  // Coda drawn manually after stave.draw() to avoid VexFlow's "Coda" text label

  // Tempo mark — rendered as Annotation on first note (not setTempo) so it stacks with chord symbols
  const tempoAnn = m.annotations.find((a) => a.kind === "tempo-mark") as TempoMark | undefined;

  stave.setContext(ctx.context).draw();

  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  const hasChordSymbols = !isSecondaryStaveLocal && m.annotations.some((a) => a.kind === "chord-symbol");

  // Coda — draw manually using VexFlow's music font (no "Coda" text label)
  if (m.navigation?.coda && !isSecondaryStaveLocal && rawCtx.save) {
    rawCtx.save();
    rawCtx.font = "28px Bravura, Petaluma, serif";
    rawCtx.fillStyle = "#000";
    const codaShift = hasChordSymbols ? style.chordSymbolSize + 8 : 0;
    rawCtx.fillText("\uE048", x - 10, y - 28 - codaShift);
    rawCtx.restore();
  }

  // Draw stave-level annotations manually with coordinated Y tracking.
  // Stacking order from staff upward (Dorico convention):
  //   chord symbols → volta → segno/coda + D.S./Fine → tempo → rehearsal marks (highest)
  const aboveStaveCtx = rawCtx;
  let aboveY = y - 6; // just above stave top

  // Chord symbols closest to staff
  const chordSymbolY = hasChordSymbols ? (aboveY -= style.chordSymbolSize + 2, aboveY + style.chordSymbolSize) : 0;

  if (m.navigation?.volta) aboveY -= 22;

  // Segno/coda above chords and volta
  if (m.navigation?.segno || m.navigation?.coda) aboveY -= 35;

  // Navigation text (Fine, D.S., D.C., To Coda) — italic, right-aligned, same level as segno
  if (m.navigation && aboveStaveCtx.save && !isSecondaryStaveLocal) {
    const nav = m.navigation;
    const textItems: string[] = [];
    if (nav.fine) textItems.push("Fine");
    if (nav.toCoda) textItems.push("To Coda");
    if (nav.dsText) textItems.push(nav.dsText);
    if (nav.dcText) textItems.push(nav.dcText);
    if (textItems.length > 0) {
      const navBaseY = aboveY; // same level as segno
      aboveStaveCtx.save();
      aboveStaveCtx.font = "italic bold 11px serif";
      aboveStaveCtx.fillStyle = "#000";
      let navY = navBaseY;
      for (const text of textItems) {
        navY -= 14;
        const tw = aboveStaveCtx.measureText(text).width;
        const navX = x + width - tw - 8;
        aboveStaveCtx.fillText(text, navX, navY + 12);
      }
      aboveStaveCtx.restore();
      // Only push aboveY if nav text went higher than segno already did
      if (navY < aboveY) aboveY = navY;
    }
  }

  // Tempo marks (skip on secondary staves)
  if (tempoAnn && aboveStaveCtx.save && !isSecondaryStaveLocal) {
    aboveStaveCtx.save();
    aboveStaveCtx.font = "bold 12px serif";
    aboveStaveCtx.fillStyle = "#000";
    const tempoText = tempoAnn.text
      ? `${tempoAnn.text} (\u2669 = ${tempoAnn.bpm})`
      : `\u2669 = ${tempoAnn.bpm}`;
    aboveY -= 22;
    const tempoX = stave.getNoteStartX() + 10;
    aboveStaveCtx.fillText(tempoText, tempoX, aboveY + 14);
    aboveStaveCtx.restore();
  }

  // Rehearsal marks — highest, boxed text (Dorico/MuseScore style)
  for (const ann of m.annotations) {
    if (ann.kind !== "rehearsal-mark") continue;
    if (isSecondaryStaveLocal) continue;
    if (!aboveStaveCtx.save) continue;
    aboveStaveCtx.save();
    aboveStaveCtx.font = "bold 20px sans-serif";
    const tw = aboveStaveCtx.measureText(ann.text).width;
    const pad = 6;
    const boxSize = Math.max(tw + pad * 2, 20 + pad * 2);
    aboveY -= boxSize + 2;
    aboveStaveCtx.strokeStyle = "#000";
    aboveStaveCtx.lineWidth = 2;
    aboveStaveCtx.beginPath();
    const rehX = stave.getNoteStartX() + 10;
    aboveStaveCtx.rect(rehX - pad, aboveY, boxSize, boxSize);
    aboveStaveCtx.stroke();
    aboveStaveCtx.fillStyle = "#000";
    aboveStaveCtx.fillText(ann.text, rehX + (boxSize - pad * 2 - tw) / 2, aboveY + boxSize / 2 + 7);
    aboveStaveCtx.restore();
  }

  const noteBoxes: NoteBox[] = [];
  const vfVoices: Voice[] = [];
  const allBeams: Beam[] = [];
  const allTuplets: VexTuplet[] = [];

  // Build VexFlow voices for all model voices that have events
  const activeVoiceCount = m.voices.filter((v, i) =>
    v && v.events.length > 0 && (!voiceFilter || voiceFilter.includes(i))
  ).length;
  const multiVoice = activeVoiceCount > 1;
  for (let vi = 0; vi < m.voices.length; vi++) {
    if (voiceFilter && !voiceFilter.includes(vi)) continue;
    const modelVoice = m.voices[vi];
    if (!modelVoice || modelVoice.events.length === 0) continue;

    const stemDir = voiceStemDirection(vi, multiVoice);
    const staveNotes: StaveNote[] = [];
    const eventIds: NoteEventId[] = [];
    let pendingGraceNotes: VexGraceNote[] = [];
    let pendingGraceIds: NoteEventId[] = [];
    const graceNoteMap: { graceNotes: VexGraceNote[]; ids: NoteEventId[] }[] = [];

    let currentBeatOffset = 0;
    for (const event of modelVoice.events) {
      if (event.kind === "grace") {
        pendingGraceNotes.push(eventToGraceNote(event));
        pendingGraceIds.push(event.id);
        continue;
      }
      // Use cross-staff clef if this note renders on the other stave
      const useClef = (crossStaffClef && isCrossStaff(event, staveIndex))
        ? crossStaffClef
        : CLEF_VEX[m.clef.type];
      const sn = eventToStaveNote(event, stemDir, useClef, prevAltered, courtesyShown, measureAltered, m.keySignature.fifths);
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
        // Chord symbols are rendered manually below (after noteBoxes are populated)
        // to maintain a fixed Y position above the stave.
        // Tempo mark is rendered manually above stave (see above), not as VexFlow annotation
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
      currentBeatOffset += durationToTicksFn(event.duration, event.tuplet);
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

    // Build set of cross-staff notes: will be hidden during Voice.draw, then redrawn on target stave
    const crossStaffNoteSet = new Set<StaveNote>();
    if (crossStaffStave) {
      // Build a lookup from event ID to model event for cross-staff check
      const eventById = new Map(m.voices.flatMap((v) => v.events.map((e) => [e.id, e] as const)));
      for (const vfVoice of vfVoices) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
        data.__staveNotes.forEach((sn, idx) => {
          const event = eventById.get(data.__eventIds[idx]);
          if (event && isCrossStaff(event, staveIndex)) {
            crossStaffNoteSet.add(sn);
          }
        });
      }
    }

    const hasRange = instrumentMinPitch != null && instrumentMaxPitch != null;
    const isOutOfRange = (event: NoteEvent | undefined): boolean => {
      if (!hasRange || !event) return false;
      const min = instrumentMinPitch as number;
      const max = instrumentMaxPitch as number;
      if (event.kind === "note") {
        const midi = pitchToMidi(event.head.pitch);
        return midi < min || midi > max;
      }
      if (event.kind === "chord") {
        return event.heads.some((h) => {
          const midi = pitchToMidi(h.pitch);
          return midi < min || midi > max;
        });
      }
      if (event.kind === "grace") {
        const midi = pitchToMidi(event.head.pitch);
        return midi < min || midi > max;
      }
      return false;
    };

    for (const vfVoice of vfVoices) {
      // Color out-of-range notes (applied first so playback/selection can override)
      if (hasRange) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[]; __voiceIndex: number };
        const voiceEvents = m.voices[data.__voiceIndex]?.events ?? [];
        data.__staveNotes.forEach((sn, idx) => {
          if (isOutOfRange(voiceEvents[idx])) {
            sn.setStyle({ fillStyle: "#d97706", strokeStyle: "#d97706" });
          }
        });
      }

      // Color active playback notes
      if (activeNoteIds?.size) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
        data.__staveNotes.forEach((sn, idx) => {
          if (activeNoteIds.has(data.__eventIds[idx])) {
            sn.setStyle({ fillStyle: "#4a6fa5", strokeStyle: "#4a6fa5" });
          }
        });
      }

      if (selectedNoteIds?.size || selectedHeadByEventId?.size) {
        const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
        data.__staveNotes.forEach((sn, idx) => {
          const eid = data.__eventIds[idx];
          if (!selectedNoteIds?.has(eid)) return;
          const headIdx = selectedHeadByEventId?.get(eid);
          if (headIdx != null) {
            // Style only the specific chord head.
            try {
              const heads = (sn as unknown as { noteHeads: { setStyle: (s: { fillStyle: string; strokeStyle: string }) => void }[] }).noteHeads;
              heads[headIdx]?.setStyle({ fillStyle: "#3b82f6", strokeStyle: "#3b82f6" });
            } catch { /* fall through */ }
          } else {
            sn.setStyle({ fillStyle: "#3b82f6", strokeStyle: "#3b82f6" });
          }
        });
      }

      // Suppress cross-staff notes during Voice.draw by replacing drawWithStyle with a no-op
      const savedDrawFns = new Map<StaveNote, () => StaveNote>();
      for (const sn of crossStaffNoteSet) {
        savedDrawFns.set(sn, sn.drawWithStyle.bind(sn));
        sn.drawWithStyle = () => sn;
      }
      vfVoice.draw(ctx.context, stave);
      // Restore drawWithStyle
      for (const [sn, fn] of savedDrawFns) {
        sn.drawWithStyle = fn;
      }

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
          // Per-head hit rects for chord events (in model head order).
          let headRects: { x: number; y: number; width: number; height: number }[] | undefined;
          const modelEvt = m.voices[data.__voiceIndex]?.events[idx];
          if (modelEvt && modelEvt.kind === "chord") {
            try {
              const heads = (sn as unknown as { noteHeads: { x: number; y: number; getWidth(): number }[] }).noteHeads;
              if (heads && heads.length === modelEvt.heads.length) {
                const hw = heads[0]?.getWidth() ?? (nhWidth > 0 ? nhWidth : 10);
                const hh = 12; // ~one line-space, vertically centered on the head
                headRects = heads.map((nh) => ({
                  x: nh.x,
                  y: nh.y - hh / 2,
                  width: hw,
                  height: hh,
                }));
              }
            } catch { /* VexFlow internals unavailable */ }
          }
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
            heads: headRects,
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

    // Redraw cross-staff notes on their target stave
    if (crossStaffStave && crossStaffNoteSet.size > 0) {
      for (const sn of crossStaffNoteSet) {
        sn.setStave(crossStaffStave);
        sn.setStyle({ fillStyle: "#000", strokeStyle: "#000" });
        sn.setContext(ctx.context);
        sn.drawWithStyle();
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

  // Chord symbols — rendered manually at a fixed Y above the stave (not note-relative).
  // Y was reserved during the aboveY stacking phase above.
  if (hasChordSymbols) {
    const csCtx = ctx.context as unknown as CanvasRenderingContext2D;
    const renderedChordIds = new Set<string>();
    if (csCtx.save) {
      csCtx.save();
      csCtx.font = `bold ${style.chordSymbolSize}px sans-serif`;
      csCtx.fillStyle = "#000";
      for (const ann of m.annotations) {
        if (ann.kind !== "chord-symbol") continue;
        if (ann.noteEventId && renderedChordIds.has(ann.noteEventId)) continue;
        const box = ann.noteEventId ? noteBoxes.find((nb) => nb.id === ann.noteEventId) : undefined;
        const chordX = box ? box.x : x + 4;
        csCtx.fillText(ann.text, chordX, chordSymbolY);
        if (ann.noteEventId) renderedChordIds.add(ann.noteEventId);
      }
      csCtx.restore();
    }
  }

  // Collect annotation boxes for interactive editing (chord symbols, lyrics).
  const annotationBoxes: AnnotationBox[] = [];
  for (const annotation of m.annotations) {
    if (annotation.kind === "chord-symbol") {
      const box = annotation.noteEventId ? noteBoxes.find((nb) => nb.id === annotation.noteEventId) : undefined;
      if (box) {
        annotationBoxes.push({
          kind: "chord-symbol",
          x: box.x, y: chordSymbolY - 4,
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
    // For grand staff: render lyrics only on the bass (bottom) stave.
    // For single staff: render lyrics normally.
    const hasMultipleStaves = voiceFilter != null && voiceFilter.length > 0;
    const isPrimaryStave = hasMultipleStaves && voiceFilter.some(i => (m.voices[i]?.staff ?? 0) === 0);
    const suppressLyrics = hasMultipleStaves && isPrimaryStave; // suppress on treble, show on bass
    const lyricAnnotations = suppressLyrics ? [] : m.annotations.filter((a) => a.kind === "lyric");
    if (lyricAnnotations.length > 0) {
      const lCtx = ctx.context as unknown as CanvasRenderingContext2D;
      if (lCtx.save) {
        // Fixed offset from stave bottom — consistent across all measures.
        // Always reserve space for dynamics and hairpins so lyrics align globally.
        const lyricBaseY = stave.getBottomY() + 40;

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

  // Show overfill/underfill indicator (MuseScore-style + or −)
  // Skip pickup measures — they're intentionally underfilled.
  if (!m.isPickup) {
    const capacity = measureCapacityFn(m.timeSignature.numerator, m.timeSignature.denominator);
    const maxTicks = Math.max(...m.voices.map((v) => voiceTicksUsedFn(v.events)), 0);
    if (maxTicks > 0 && maxTicks !== capacity) {
      const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
      if (rawCtx.save) {
        rawCtx.save();
        const isOver = maxTicks > capacity;
        const symbol = isOver ? "+" : "\u2212";
        rawCtx.fillStyle = isOver ? "#ef4444" : "#f59e0b";
        rawCtx.font = "bold 16px sans-serif";
        rawCtx.textAlign = "right";
        rawCtx.fillText(symbol, x + width - 4, y - 2);
        rawCtx.textAlign = "start";
        rawCtx.restore();
      }
    }
  }

  // Build staveNote map for cross-measure tie/slur rendering
  const staveNoteMap = new Map<NoteEventId, StaveNote>();
  for (const vfVoice of vfVoices) {
    const data = vfVoice as unknown as { __staveNotes: StaveNote[]; __eventIds: NoteEventId[] };
    for (let idx = 0; idx < data.__eventIds.length; idx++) {
      staveNoteMap.set(data.__eventIds[idx], data.__staveNotes[idx]);
    }
  }

  return {
    noteBoxes,
    annotationBoxes,
    staveY: y,
    staveX: x,
    width,
    staveNoteMap,
    vexStave: stave,
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
  try {
    const topStave = new Stave(x, topY, 0).setContext(ctx.context);
    const bottomStave = new Stave(x, bottomY - 80, 0).setContext(ctx.context);
    const connector = new StaveConnector(topStave, bottomStave);
    connector.setType("brace");
    connector.setContext(ctx.context).draw();
  } catch {
    // Fallback: manual bezier brace
    const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
    if (rawCtx.save) {
      rawCtx.save();
      rawCtx.strokeStyle = "#000";
      rawCtx.lineWidth = 2;
      const midY = (topY + bottomY) / 2;
      const height = bottomY - topY;
      rawCtx.beginPath();
      rawCtx.moveTo(x, topY);
      rawCtx.bezierCurveTo(x - 8, topY + height * 0.25, x - 8, midY - 5, x - 3, midY);
      rawCtx.bezierCurveTo(x - 8, midY + 5, x - 8, topY + height * 0.75, x, bottomY);
      rawCtx.stroke();
      rawCtx.restore();
    }
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
  prevKeySigFifths?: number,
): MeasureRenderResult {
  const stave = new Stave(x, y, width);
  if (showClef) stave.addClef(CLEF_VEX[m.clef.type] || "treble");
  if (showKeySig) {
    const keySig = KEY_SIG_MAP[m.keySignature.fifths] ?? "C";
    const cancelKey = prevKeySigFifths !== undefined && prevKeySigFifths !== m.keySignature.fifths
      ? KEY_SIG_MAP[prevKeySigFifths] ?? "C"
      : undefined;
    stave.addKeySignature(keySig, cancelKey);
  }
  stave.setContext(ctx.context).draw();

  const mmr = new MultiMeasureRest(numberOfMeasures, {
    numberOfMeasures,
    showNumber: true,
  });
  mmr.setStave(stave);
  mmr.setContext(ctx.context as unknown as import("vexflow").RenderContext);
  mmr.draw();

  // Draw global annotations above multi-measure rests
  const rawCtx = ctx.context as unknown as CanvasRenderingContext2D;
  if (rawCtx.save) {
    let aboveY = y - 6;
    if (m.navigation?.volta) aboveY -= 22;
    if (m.navigation?.segno || m.navigation?.coda) aboveY -= 20;

    for (const ann of m.annotations) {
      if (ann.kind === "rehearsal-mark") {
        rawCtx.save();
        rawCtx.font = "bold 14px sans-serif";
        const tw = rawCtx.measureText(ann.text).width;
        const pad = 4;
        const boxH = 14 + pad * 2;
        aboveY -= boxH + 2;
        rawCtx.strokeStyle = "#000";
        rawCtx.lineWidth = 1.5;
        rawCtx.beginPath();
        rawCtx.rect(x + 2 - pad, aboveY, tw + pad * 2, boxH);
        rawCtx.stroke();
        rawCtx.fillStyle = "#000";
        rawCtx.fillText(ann.text, x + 2, aboveY + boxH - pad - 2);
        rawCtx.restore();
      }
    }

    const tempoAnn = m.annotations.find((a) => a.kind === "tempo-mark") as TempoMark | undefined;
    if (tempoAnn) {
      rawCtx.save();
      rawCtx.font = "bold 12px serif";
      rawCtx.fillStyle = "#000";
      const text = tempoAnn.text
        ? `${tempoAnn.text} (\u2669 = ${tempoAnn.bpm})`
        : `\u2669 = ${tempoAnn.bpm}`;
      aboveY -= 16;
      rawCtx.fillText(text, x + 2, aboveY);
      rawCtx.restore();
    }

  }

  return { noteBoxes: [], annotationBoxes: [], staveY: y, staveX: x, width, staveNoteMap: new Map(), vexStave: stave };
}

export function clearCanvas(ctx: RenderContext, canvas: HTMLCanvasElement): void {
  ctx.context.clearRect(0, 0, canvas.width, canvas.height);
}
