import type { Score, Part, Measure, Voice } from "../model/score";
import type { NoteEvent, NoteHead, Articulation, TupletRatio } from "../model/note";
import type { Pitch, Accidental } from "../model/pitch";
import type { Duration } from "../model/duration";
import type { Annotation } from "../model/annotations";
import type { Stylesheet } from "../model/stylesheet";
import type { NavigationMarks } from "../model/navigation";
import type { ClefType, BarlineType } from "../model/time";
import type { PitchClass, Octave } from "../model/pitch";
import type { DurationType } from "../model/duration";
import { newId, type ScoreId, type PartId, type MeasureId, type VoiceId, type NoteEventId } from "../model/ids";

const FORMAT_VERSION = 1;

// ─── Serialization (Score → JSON string) ────────────────────────────

function pitchToStr(p: Pitch): string {
  const acc =
    p.accidental === "sharp" ? "#" :
    p.accidental === "flat" ? "b" :
    p.accidental === "double-sharp" ? "##" :
    p.accidental === "double-flat" ? "bb" :
    "";
  return `${p.pitchClass}${p.octave}${acc}`;
}

function durationToStr(d: Duration): string {
  return d.type + ".".repeat(d.dots);
}

function noteHeadToJson(h: NoteHead): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    pitch: pitchToStr(h.pitch),
  };
  if (h.pitch.accidental !== "natural") obj.accidental = h.pitch.accidental;
  if (h.tied) obj.tied = true;
  if (h.tabInfo) obj.tab = { string: h.tabInfo.string, fret: h.tabInfo.fret };
  return obj;
}

function articulationToJson(art: Articulation): string {
  if (art.kind === "bend" || art.kind === "pre-bend" || art.kind === "bend-release") {
    return `${art.kind}:${art.semitones}`;
  }
  return art.kind;
}

function eventToJson(e: NoteEvent): Record<string, unknown> {
  const dur = durationToStr(e.duration);

  switch (e.kind) {
    case "note": {
      const obj: Record<string, unknown> = {
        type: "note",
        id: e.id,
        pitch: pitchToStr(e.head.pitch),
        duration: dur,
      };
      if (e.head.pitch.accidental !== "natural") obj.accidental = e.head.pitch.accidental;
      if (e.head.tied) obj.tied = true;
      if (e.stemDirection) obj.stem = e.stemDirection;
      if (e.tabInfo) obj.tab = { string: e.tabInfo.string, fret: e.tabInfo.fret };
      if (e.articulations?.length) obj.articulations = e.articulations.map(articulationToJson);
      if (e.tuplet) obj.tuplet = { actual: e.tuplet.actual, normal: e.tuplet.normal };
      if (e.renderStaff != null) obj.renderStaff = e.renderStaff;
      return obj;
    }
    case "chord": {
      const obj: Record<string, unknown> = {
        type: "chord",
        id: e.id,
        pitches: e.heads.map((h) => pitchToStr(h.pitch)),
        duration: dur,
      };
      // Include per-head details if any head has non-default accidental or tie
      const hasDetails = e.heads.some(h => h.tied || h.tabInfo);
      if (hasDetails) {
        obj.heads = e.heads.map(noteHeadToJson);
      }
      if (e.stemDirection) obj.stem = e.stemDirection;
      if (e.tabInfo) obj.tab = { string: e.tabInfo.string, fret: e.tabInfo.fret };
      if (e.articulations?.length) obj.articulations = e.articulations.map(articulationToJson);
      if (e.tuplet) obj.tuplet = { actual: e.tuplet.actual, normal: e.tuplet.normal };
      if (e.renderStaff != null) obj.renderStaff = e.renderStaff;
      return obj;
    }
    case "rest": {
      const obj: Record<string, unknown> = { type: "rest", id: e.id, duration: dur };
      if (e.tuplet) obj.tuplet = { actual: e.tuplet.actual, normal: e.tuplet.normal };
      return obj;
    }
    case "slash": {
      const obj: Record<string, unknown> = { type: "slash", id: e.id, duration: dur };
      if (e.tuplet) obj.tuplet = { actual: e.tuplet.actual, normal: e.tuplet.normal };
      return obj;
    }
    case "grace": {
      const obj: Record<string, unknown> = {
        type: "grace",
        id: e.id,
        pitch: pitchToStr(e.head.pitch),
        duration: dur,
      };
      if (e.head.pitch.accidental !== "natural") obj.accidental = e.head.pitch.accidental;
      if (e.slash === false) obj.slash = false;
      if (e.renderStaff != null) obj.renderStaff = e.renderStaff;
      return obj;
    }
  }
}

function annotationToJson(a: Annotation): Record<string, unknown> {
  switch (a.kind) {
    case "chord-symbol":
      return { type: "chord", beat: a.beatOffset, symbol: a.text, noteEventId: a.noteEventId };
    case "lyric":
      return {
        type: "lyric",
        text: a.text,
        noteEventId: a.noteEventId,
        syllable: a.syllableType,
        verse: a.verseNumber,
      };
    case "rehearsal-mark":
      return { type: "rehearsal", label: a.text };
    case "tempo-mark": {
      const obj: Record<string, unknown> = { type: "tempo", bpm: a.bpm, beatUnit: a.beatUnit };
      if (a.text) obj.text = a.text;
      if (a.swing) obj.swing = a.swing;
      return obj;
    }
    case "dynamic":
      return { type: "dynamic", level: a.level, noteEventId: a.noteEventId };
    case "hairpin":
      return { type: "hairpin", hairpinType: a.type, startEventId: a.startEventId, endEventId: a.endEventId };
    case "slur":
      return { type: "slur", startEventId: a.startEventId, endEventId: a.endEventId };
  }
}

function measureToJson(m: Measure, index: number): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    number: index + 1,
    time: `${m.timeSignature.numerator}/${m.timeSignature.denominator}`,
    key: m.keySignature.fifths,
    clef: m.clef.type,
  };

  if (m.isPickup) obj.pickup = true;
  if (m.barlineEnd !== "single") obj.barline = m.barlineEnd;

  if (m.annotations.length > 0) {
    obj.annotations = m.annotations.map(annotationToJson);
  }

  if (m.navigation) {
    obj.navigation = m.navigation;
  }

  obj.voices = m.voices.map((v) => ({
    events: v.events.map(eventToJson),
    ...(v.staff != null && v.staff !== 0 ? { staff: v.staff } : {}),
  }));

  return obj;
}

function scoreToJson(score: Score): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    formatVersion: FORMAT_VERSION,
    title: score.title,
    composer: score.composer,
    tempo: score.tempo,
    parts: score.parts.map((part) => {
      const p: Record<string, unknown> = {
        name: part.name,
        abbreviation: part.abbreviation,
        instrument: part.instrumentId || "piano",
        muted: part.muted || undefined,
        solo: part.solo || undefined,
        tuning: part.tuning || undefined,
        capo: part.capo || undefined,
        measures: part.measures.map((m, i) => measureToJson(m, i)),
      };
      return p;
    }),
  };

  if (score.stylesheet && Object.keys(score.stylesheet).length > 0) {
    obj.stylesheet = score.stylesheet;
  }

  return obj;
}

export function serializeToJson(score: Score): string {
  return JSON.stringify(scoreToJson(score), null, 2);
}

// ─── Deserialization (JSON string → Score) ───────────────────────────

function parsePitchStr(s: string): { pitchClass: PitchClass; octave: Octave; accidental: Accidental } {
  const pc = s[0].toUpperCase() as PitchClass;
  let rest = s.slice(1);
  let accidental: Accidental = "natural";
  let octave = 4;

  const octaveMatch = rest.match(/(\d)/);
  if (octaveMatch) {
    octave = parseInt(octaveMatch[1]);
    rest = rest.replace(/\d/, "");
  }

  if (rest === "##" || rest === "double-sharp") accidental = "double-sharp";
  else if (rest === "bb" || rest === "double-flat") accidental = "double-flat";
  else if (rest === "#" || rest === "sharp") accidental = "sharp";
  else if (rest === "b" || rest === "flat") accidental = "flat";

  return { pitchClass: pc, octave: octave as Octave, accidental };
}

function parseDurationStr(s: string): Duration {
  let dots = 0;
  let base = s;
  while (base.endsWith(".")) {
    dots++;
    base = base.slice(0, -1);
  }
  return { type: base as DurationType, dots: Math.min(dots, 3) as 0 | 1 | 2 | 3 };
}

function parseArticulations(arr: string[]): Articulation[] {
  return arr.map((s) => {
    const colonIdx = s.indexOf(":");
    if (colonIdx !== -1) {
      const kind = s.slice(0, colonIdx);
      const semitones = parseInt(s.slice(colonIdx + 1));
      if (kind === "bend" || kind === "pre-bend" || kind === "bend-release") {
        return { kind, semitones } as Articulation;
      }
    }
    return { kind: s } as Articulation;
  });
}

function parseTuplet(e: Record<string, unknown>): TupletRatio | undefined {
  if (e.tuplet && typeof e.tuplet === "object") {
    const t = e.tuplet as Record<string, unknown>;
    const actual = t.actual as number;
    const normal = t.normal as number;
    if (actual && normal) return { actual, normal };
  }
  return undefined;
}

function parseEvent(e: Record<string, unknown>): NoteEvent {
  const id = (e.id as NoteEventId) || newId<NoteEventId>("evt");
  const type = e.type as string;
  const durStr = (e.duration as string) || "quarter";
  const duration = parseDurationStr(durStr);
  const tuplet = parseTuplet(e);

  if (type === "rest") {
    return { kind: "rest", id, duration, ...(tuplet ? { tuplet } : {}) } as NoteEvent;
  }

  if (type === "slash") {
    return { kind: "slash", id, duration, ...(tuplet ? { tuplet } : {}) } as NoteEvent;
  }

  if (type === "grace") {
    const pitchStr = (e.pitch as string) || "C4";
    const { pitchClass, octave, accidental: parsedAcc } = parsePitchStr(pitchStr);
    const explicitAcc = e.accidental as string | undefined;
    let accidental: Accidental = parsedAcc;
    if (explicitAcc === "sharp") accidental = "sharp";
    else if (explicitAcc === "flat") accidental = "flat";
    else if (explicitAcc === "double-sharp") accidental = "double-sharp";
    else if (explicitAcc === "double-flat") accidental = "double-flat";
    return {
      kind: "grace",
      id,
      duration,
      head: { pitch: { pitchClass, accidental, octave } },
      slash: (e.slash as boolean) ?? true,
      ...(typeof e.renderStaff === "number" ? { renderStaff: e.renderStaff } : {}),
    } as NoteEvent;
  }

  if (type === "chord" && Array.isArray(e.pitches)) {
    const heads: NoteHead[] = (e.pitches as string[]).map((p) => {
      const { pitchClass, octave, accidental } = parsePitchStr(p);
      return { pitch: { pitchClass, accidental, octave } };
    });
    return {
      kind: "chord", id, duration, heads,
      ...(e.stem ? { stemDirection: e.stem } : {}),
      ...(e.tab ? { tabInfo: e.tab } : {}),
      ...(Array.isArray(e.articulations) ? { articulations: parseArticulations(e.articulations as string[]) } : {}),
      ...(tuplet ? { tuplet } : {}),
      ...(typeof e.renderStaff === "number" ? { renderStaff: e.renderStaff } : {}),
    } as NoteEvent;
  }

  // Single note
  const pitchStr = (e.pitch as string) || "C4";
  const { pitchClass, octave, accidental: parsedAcc } = parsePitchStr(pitchStr);
  const explicitAcc = e.accidental as string | undefined;
  let accidental: Accidental = parsedAcc;
  if (explicitAcc === "sharp") accidental = "sharp";
  else if (explicitAcc === "flat") accidental = "flat";
  else if (explicitAcc === "double-sharp") accidental = "double-sharp";
  else if (explicitAcc === "double-flat") accidental = "double-flat";

  return {
    kind: "note",
    id,
    duration,
    head: {
      pitch: { pitchClass, accidental, octave },
      tied: (e.tied as boolean) || undefined,
    },
    ...(e.stem ? { stemDirection: e.stem } : {}),
    ...(e.tab ? { tabInfo: e.tab } : {}),
    ...(Array.isArray(e.articulations) ? { articulations: parseArticulations(e.articulations as string[]) } : {}),
    ...(tuplet ? { tuplet } : {}),
    ...(typeof e.renderStaff === "number" ? { renderStaff: e.renderStaff } : {}),
  } as NoteEvent;
}

function parseAnnotation(a: Record<string, unknown>): Annotation | null {
  const type = a.type as string;
  if (type === "chord") {
    return {
      kind: "chord-symbol",
      text: (a.symbol as string) || "",
      beatOffset: (a.beat as number) ?? 0,
      noteEventId: a.noteEventId as import("../model/ids").NoteEventId,
    };
  }
  if (type === "lyric") {
    return {
      kind: "lyric",
      text: (a.text as string) || "",
      noteEventId: ((a.noteEventId as string) || "") as unknown as NoteEventId,
      syllableType: (a.syllable as "begin" | "middle" | "end" | "single") || "single",
      verseNumber: (a.verse as number) ?? 1,
    };
  }
  if (type === "rehearsal") {
    return {
      kind: "rehearsal-mark",
      text: (a.label as string) || "",
    };
  }
  if (type === "tempo") {
    const tempo: Annotation = {
      kind: "tempo-mark",
      bpm: (a.bpm as number) ?? 120,
      beatUnit: (a.beatUnit as DurationType) || "quarter",
      text: a.text as string | undefined,
    };
    if (a.swing && typeof a.swing === "object") {
      const s = a.swing as Record<string, unknown>;
      (tempo as import("../model/annotations").TempoMark).swing = {
        style: (s.style as string as import("../model/annotations").SwingStyle) || "swing",
        ...(typeof s.ratio === "number" ? { ratio: s.ratio } : {}),
        ...(s.subdivision === "sixteenth" ? { subdivision: "sixteenth" as const } : {}),
        ...(typeof s.backbeatAccent === "number" ? { backbeatAccent: s.backbeatAccent } : {}),
      };
    }
    return tempo;
  }
  if (type === "dynamic") {
    return {
      kind: "dynamic",
      level: (a.level as string) as import("../model/annotations").DynamicLevel,
      noteEventId: ((a.noteEventId as string) || "") as unknown as NoteEventId,
    };
  }
  if (type === "hairpin") {
    return {
      kind: "hairpin",
      type: (a.hairpinType as "crescendo" | "diminuendo") || "crescendo",
      startEventId: ((a.startEventId as string) || "") as unknown as NoteEventId,
      endEventId: ((a.endEventId as string) || "") as unknown as NoteEventId,
    };
  }
  if (type === "slur") {
    return {
      kind: "slur",
      startEventId: ((a.startEventId as string) || "") as unknown as NoteEventId,
      endEventId: ((a.endEventId as string) || "") as unknown as NoteEventId,
    };
  }
  return null;
}

export function parseMeasure(m: Record<string, unknown>): Measure {
  const timeStr = (m.time as string) || "4/4";
  const [num, den] = timeStr.split("/").map(Number);

  const annotations: Annotation[] = [];
  if (Array.isArray(m.annotations)) {
    for (const a of m.annotations) {
      const parsed = parseAnnotation(a as Record<string, unknown>);
      if (parsed) annotations.push(parsed);
    }
  }

  const voices: Voice[] = [];
  if (Array.isArray(m.voices)) {
    for (const v of m.voices as Record<string, unknown>[]) {
      const events: NoteEvent[] = [];
      if (Array.isArray(v.events)) {
        for (const e of v.events as Record<string, unknown>[]) {
          events.push(parseEvent(e));
        }
      }
      const staff = typeof v.staff === "number" ? v.staff : undefined;
      voices.push({ id: newId<VoiceId>("vce"), events, ...(staff != null ? { staff } : {}) });
    }
  }

  if (voices.length === 0) {
    voices.push({ id: newId<VoiceId>("vce"), events: [] });
  }

  return {
    id: newId<MeasureId>("msr"),
    clef: { type: ((m.clef as string) || "treble") as ClefType },
    timeSignature: { numerator: num || 4, denominator: den || 4 },
    keySignature: { fifths: (m.key as number) ?? 0 },
    barlineEnd: ((m.barline as string) || "single") as BarlineType,
    annotations,
    navigation: (m.navigation as NavigationMarks) || undefined,
    voices,
    isPickup: (m.pickup as boolean) || undefined,
  };
}

export function jsonToScore(json: Record<string, unknown>): Score {
  const parts: Part[] = [];

  if (Array.isArray(json.parts)) {
    for (const p of json.parts as Record<string, unknown>[]) {
      const measures: Measure[] = [];
      if (Array.isArray(p.measures)) {
        for (const m of p.measures as Record<string, unknown>[]) {
          measures.push(parseMeasure(m));
        }
      }
      const part: Part = {
        id: newId<PartId>("prt"),
        name: (p.name as string) || "Part",
        abbreviation: (p.abbreviation as string) || ((p.name as string) || "P").slice(0, 3),
        instrumentId: (p.instrument as string) || "piano",
        muted: (p.muted as boolean) || false,
        solo: (p.solo as boolean) || false,
        measures,
      };
      if (p.tuning) part.tuning = p.tuning as Part["tuning"];
      if (typeof p.capo === "number" && p.capo > 0) part.capo = p.capo as number;
      parts.push(part);
    }
  }

  const score: Score = {
    id: newId<ScoreId>("scr"),
    title: (json.title as string) || "Untitled",
    composer: (json.composer as string) || "",
    formatVersion: (json.formatVersion as number) || FORMAT_VERSION,
    tempo: (json.tempo as number) ?? 120,
    parts,
  };

  if (json.stylesheet && typeof json.stylesheet === "object") {
    score.stylesheet = json.stylesheet as Partial<Stylesheet>;
  }

  return score;
}

export function deserializeFromJson(text: string): Score {
  const json = JSON.parse(text) as Record<string, unknown>;
  return jsonToScore(json);
}

// ─── AI-specific helpers ─────────────────────────────────────────────

/**
 * Converts a score to a JSON object for AI context.
 * Filters out empty measures to reduce token usage.
 */
export function scoreToAIJson(score: Score): object {
  return {
    title: score.title,
    composer: score.composer,
    tempo: score.tempo,
    parts: score.parts.map((part) => {
      const measures = part.measures
        .map((m, mi) => ({ m, mi }))
        .filter(({ m }) => hasContent(m))
        .map(({ m, mi }) => measureToJson(m, mi));
      return {
        name: part.name,
        instrument: part.instrumentId || "piano",
        totalMeasures: part.measures.length,
        measures: measures.length > 0 ? measures : [measureToJson(part.measures[0], 0)],
      };
    }),
  };
}

function hasContent(m: Measure): boolean {
  return (
    m.voices.some((v) => v.events.length > 0) ||
    m.annotations.length > 0 ||
    m.navigation !== undefined
  );
}
