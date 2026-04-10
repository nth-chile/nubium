import type { Score, Part, Measure, Voice } from "../model/score";
import { getInstrument } from "../model/instruments";
import type { NoteEvent, NoteHead, TupletRatio, Articulation } from "../model/note";
import type { Pitch } from "../model/pitch";
import type { Duration } from "../model/duration";
import type { Annotation, ChordSymbol, Lyric, DynamicMark, Hairpin, Slur } from "../model/annotations";
import { durationToTicks, type DurationType } from "../model/duration";
import { getBeamGroups } from "../renderer/beaming";
import type { ViewConfig } from "../views/ViewMode";
import { getPartDisplay } from "../views/ViewMode";
import {
  DURATION_TYPE_TO_XML,
  DURATION_DIVISIONS,
  MUSICXML_DIVISIONS,
  ACCIDENTAL_TO_ALTER,
  ACCIDENTAL_TO_XML,
  CLEF_TO_XML,
} from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function durationDivisions(d: Duration): number {
  let divs = DURATION_DIVISIONS[d.type];
  let dotVal = divs / 2;
  for (let i = 0; i < d.dots; i++) {
    divs += dotVal;
    dotVal /= 2;
  }
  return divs;
}

function pitchXml(p: Pitch): string {
  const alter = ACCIDENTAL_TO_ALTER[p.accidental];
  let xml = `        <pitch>\n`;
  xml += `          <step>${p.pitchClass}</step>\n`;
  if (alter !== 0) {
    xml += `          <alter>${alter}</alter>\n`;
  }
  xml += `          <octave>${p.octave}</octave>\n`;
  xml += `        </pitch>\n`;
  return xml;
}

function accidentalXml(p: Pitch): string {
  if (p.accidental === "natural") return "";
  return `        <accidental>${ACCIDENTAL_TO_XML[p.accidental]}</accidental>\n`;
}

function durationXml(d: Duration, tuplet?: TupletRatio): string {
  let divs = durationDivisions(d);
  if (tuplet) {
    divs = Math.round((divs * tuplet.normal) / tuplet.actual);
  }
  let xml = `        <duration>${divs}</duration>\n`;
  xml += `        <type>${DURATION_TYPE_TO_XML[d.type]}</type>\n`;
  for (let i = 0; i < d.dots; i++) {
    xml += `        <dot/>\n`;
  }
  if (tuplet) {
    xml += `        <time-modification>\n`;
    xml += `          <actual-notes>${tuplet.actual}</actual-notes>\n`;
    xml += `          <normal-notes>${tuplet.normal}</normal-notes>\n`;
    xml += `        </time-modification>\n`;
  }
  return xml;
}

/** Beam depth for a given duration type (number of beams). */
const BEAM_LEVELS: Partial<Record<DurationType, number>> = {
  "eighth": 1, "16th": 2, "32nd": 3, "64th": 4,
};

type BeamState = "begin" | "continue" | "end";

function beamXml(beamState: BeamState | undefined, durationType: DurationType): string {
  if (!beamState) return "";
  const levels = BEAM_LEVELS[durationType] ?? 0;
  let xml = "";
  for (let l = 1; l <= levels; l++) {
    xml += `        <beam number="${l}">${beamState}</beam>\n`;
  }
  return xml;
}

function tieXml(tieStart: boolean | undefined, tieStop: boolean | undefined, isChordTag: boolean): string {
  let xml = "";
  if (isChordTag) return xml;
  if (tieStop) xml += `        <tie type="stop"/>\n`;
  if (tieStart) xml += `        <tie type="start"/>\n`;
  return xml;
}

// Map our articulation kinds to MusicXML element names
const ART_TO_XML: Record<string, { parent: "articulations" | "ornaments" | "notations" | "technical"; tag: string }> = {
  staccato: { parent: "articulations", tag: "staccato" },
  staccatissimo: { parent: "articulations", tag: "staccatissimo" },
  accent: { parent: "articulations", tag: "accent" },
  tenuto: { parent: "articulations", tag: "tenuto" },
  marcato: { parent: "articulations", tag: "strong-accent" },
  fermata: { parent: "notations", tag: "fermata" },
  "up-bow": { parent: "articulations", tag: "up-bow" },
  "down-bow": { parent: "articulations", tag: "down-bow" },
  "open-string": { parent: "articulations", tag: "open-string" },
  stopped: { parent: "articulations", tag: "stopped" },
  trill: { parent: "ornaments", tag: "trill-mark" },
  mordent: { parent: "ornaments", tag: "mordent" },
  turn: { parent: "ornaments", tag: "turn" },
  "hammer-on": { parent: "technical", tag: "hammer-on" },
  "pull-off": { parent: "technical", tag: "pull-off" },
  harmonic: { parent: "technical", tag: "harmonic" },
  "palm-mute": { parent: "technical", tag: "palm-mute" },  // non-standard but common extension
  "dead-note": { parent: "technical", tag: "dead-note" },   // non-standard but common extension
  vibrato: { parent: "technical", tag: "vibrato" },          // non-standard but common extension
  tapping: { parent: "technical", tag: "tap" },
  "let-ring": { parent: "technical", tag: "let-ring" },      // non-standard but common extension
  "down-stroke": { parent: "technical", tag: "down-bow" },   // reuse bowing notation for pick direction
  "up-stroke": { parent: "technical", tag: "up-bow" },
  "tremolo-picking": { parent: "ornaments", tag: "tremolo" },
};

function notationsXml(
  tieStart: boolean | undefined,
  tupletPosition?: "start" | "stop",
  slurPositions?: ("start" | "stop")[],
  articulations?: Articulation[],
  tieStop?: boolean,
): string {
  const hasSlurs = slurPositions && slurPositions.length > 0;
  const hasArts = articulations && articulations.length > 0;
  if (!tieStart && !tieStop && !tupletPosition && !hasSlurs && !hasArts) return "";

  let xml = `        <notations>\n`;
  if (tieStop) {
    xml += `          <tied type="stop"/>\n`;
  }
  if (tieStart) {
    xml += `          <tied type="start"/>\n`;
  }
  if (tupletPosition) {
    xml += `          <tuplet type="${tupletPosition}"/>\n`;
  }
  if (hasSlurs) {
    for (const pos of slurPositions!) {
      xml += `          <slur type="${pos}"/>\n`;
    }
  }
  if (hasArts) {
    const artXmls: string[] = [];
    const ornXmls: string[] = [];
    const techXmls: string[] = [];
    for (const art of articulations!) {
      // Special handling for bends (need <bend-alter> child)
      if (art.kind === "bend" || art.kind === "pre-bend" || art.kind === "bend-release") {
        const semitones = (art as { semitones: number }).semitones ?? 2;
        if (art.kind === "pre-bend") {
          techXmls.push(`            <bend>\n              <bend-alter>${semitones}</bend-alter>\n              <pre-bend/>\n            </bend>\n`);
        } else if (art.kind === "bend-release") {
          techXmls.push(`            <bend>\n              <bend-alter>${semitones}</bend-alter>\n              <release/>\n            </bend>\n`);
        } else {
          techXmls.push(`            <bend>\n              <bend-alter>${semitones}</bend-alter>\n            </bend>\n`);
        }
        continue;
      }
      // Special handling for slides (need type attribute)
      if (art.kind === "slide-up" || art.kind === "slide-down") {
        techXmls.push(`            <slide type="start" line-type="solid"/>\n`);
        continue;
      }
      if (art.kind === "slide-in-below" || art.kind === "slide-in-above") {
        techXmls.push(`            <slide type="start" line-type="dashed"/>\n`);
        continue;
      }
      if (art.kind === "slide-out-below" || art.kind === "slide-out-above") {
        techXmls.push(`            <slide type="stop" line-type="dashed"/>\n`);
        continue;
      }
      // Ghost note wraps the note in parentheses via notation
      if (art.kind === "ghost-note") {
        techXmls.push(`            <other-technical>ghost</other-technical>\n`);
        continue;
      }
      // Fingerpicking
      if (art.kind === "fingerpick-p" || art.kind === "fingerpick-i" || art.kind === "fingerpick-m" || art.kind === "fingerpick-a") {
        const finger = art.kind.split("-")[1];
        techXmls.push(`            <fingering>${finger}</fingering>\n`);
        continue;
      }
      const mapping = ART_TO_XML[art.kind];
      if (!mapping) continue;
      if (mapping.parent === "articulations") {
        artXmls.push(`            <${mapping.tag}/>\n`);
      } else if (mapping.parent === "ornaments") {
        ornXmls.push(`            <${mapping.tag}/>\n`);
      } else if (mapping.parent === "notations") {
        xml += `          <${mapping.tag}/>\n`;
      } else if (mapping.parent === "technical") {
        techXmls.push(`            <${mapping.tag}/>\n`);
      }
    }
    if (artXmls.length > 0) {
      xml += `          <articulations>\n${artXmls.join("")}          </articulations>\n`;
    }
    if (ornXmls.length > 0) {
      xml += `          <ornaments>\n${ornXmls.join("")}          </ornaments>\n`;
    }
    if (techXmls.length > 0) {
      xml += `          <technical>\n${techXmls.join("")}          </technical>\n`;
    }
  }
  xml += `        </notations>\n`;
  return xml;
}

function findLyricForEvent(
  annotations: Annotation[],
  eventId: string
): Lyric[] {
  return annotations.filter(
    (a): a is Lyric => a.kind === "lyric" && a.noteEventId === eventId
  );
}

function lyricXml(lyrics: Lyric[]): string {
  let xml = "";
  for (const lyric of lyrics) {
    const syllabic = lyric.syllableType;
    xml += `        <lyric number="${lyric.verseNumber}">\n`;
    xml += `          <syllabic>${syllabic}</syllabic>\n`;
    xml += `          <text>${esc(lyric.text)}</text>\n`;
    xml += `        </lyric>\n`;
  }
  return xml;
}

/** Map chord symbol text (after root) to MusicXML kind values. */
function chordTextToKind(text: string): string {
  const t = text.toLowerCase().replace(/\s/g, "");
  if (!t || t === "maj" || t === "major") return "major";
  if (t === "m" || t === "min" || t === "minor" || t === "-") return "minor";
  if (t === "7" || t === "dom7") return "dominant";
  if (t === "maj7" || t === "major7" || t === "M7" || t === "Δ7" || t === "△7") return "major-seventh";
  if (t === "m7" || t === "min7" || t === "-7" || t === "minor7") return "minor-seventh";
  if (t === "dim" || t === "o" || t === "°") return "diminished";
  if (t === "aug" || t === "+" || t === "#5") return "augmented";
  if (t === "dim7" || t === "o7" || t === "°7") return "diminished-seventh";
  if (t === "m7b5" || t === "ø" || t === "ø7") return "half-diminished";
  if (t === "sus4" || t === "sus") return "suspended-fourth";
  if (t === "sus2") return "suspended-second";
  if (t === "6") return "major-sixth";
  if (t === "m6" || t === "min6") return "minor-sixth";
  if (t === "9") return "dominant-ninth";
  if (t === "maj9") return "major-ninth";
  if (t === "m9" || t === "min9") return "minor-ninth";
  if (t === "11") return "dominant-11th";
  if (t === "13") return "dominant-13th";
  if (t === "aug7" || t === "+7") return "augmented-seventh";
  if (t === "5" || t === "power") return "power";
  return "other";
}

function harmonyXml(chordSymbols: ChordSymbol[]): string {
  let xml = "";
  for (const cs of chordSymbols) {
    xml += `      <harmony>\n`;
    xml += `        <root>\n`;
    // Parse root from text — take first letter (+ optional accidental)
    const text = cs.text;
    let root = text[0];
    let kindStart = 1;
    if (text.length > 1 && (text[1] === "#" || text[1] === "b")) {
      kindStart = 2;
    }
    xml += `          <root-step>${root}</root-step>\n`;
    if (kindStart === 2) {
      const alter = text[1] === "#" ? 1 : -1;
      xml += `          <root-alter>${alter}</root-alter>\n`;
    }
    xml += `        </root>\n`;
    const kindText = text.slice(kindStart);
    const kind = chordTextToKind(kindText);
    xml += `        <kind${kindText ? ` text="${esc(kindText)}"` : ""}>${kind}</kind>\n`;
    xml += `      </harmony>\n`;
  }
  return xml;
}

function dynamicDirectionXml(dynamics: DynamicMark[]): string {
  let xml = "";
  for (const dyn of dynamics) {
    xml += `      <direction placement="below">\n`;
    xml += `        <direction-type>\n`;
    xml += `          <dynamics>\n`;
    xml += `            <${dyn.level}/>\n`;
    xml += `          </dynamics>\n`;
    xml += `        </direction-type>\n`;
    xml += `      </direction>\n`;
  }
  return xml;
}

function hairpinDirectionXml(hairpins: { hairpin: Hairpin; position: "start" | "stop" }[]): string {
  let xml = "";
  for (const { hairpin, position } of hairpins) {
    const wedgeType = position === "start"
      ? (hairpin.type === "crescendo" ? "crescendo" : "diminuendo")
      : "stop";
    xml += `      <direction placement="below">\n`;
    xml += `        <direction-type>\n`;
    xml += `          <wedge type="${wedgeType}"/>\n`;
    xml += `        </direction-type>\n`;
    xml += `      </direction>\n`;
  }
  return xml;
}

function exportNoteEvent(
  event: NoteEvent,
  voiceNumber: number,
  annotations: Annotation[],
  tupletPosition?: "start" | "stop",
  prevTied?: boolean,
  staffNumber?: number,
  beamState?: BeamState,
): string {
  let xml = "";
  const staffXml = staffNumber != null ? `        <staff>${staffNumber}</staff>\n` : "";
  const tuplet = event.tuplet;

  // Emit dynamics attached to this event
  const dynamics = annotations.filter(
    (a): a is DynamicMark => a.kind === "dynamic" && a.noteEventId === event.id
  );
  if (dynamics.length > 0) {
    xml += dynamicDirectionXml(dynamics);
  }

  // Emit hairpin starts before note, stops collected for after note
  const hairpinStarts: { hairpin: Hairpin; position: "start" }[] = [];
  const hairpinStops: { hairpin: Hairpin; position: "stop" }[] = [];
  for (const a of annotations) {
    if (a.kind !== "hairpin") continue;
    if (a.startEventId === event.id) hairpinStarts.push({ hairpin: a, position: "start" });
    if (a.endEventId === event.id) hairpinStops.push({ hairpin: a, position: "stop" });
  }
  if (hairpinStarts.length > 0) {
    xml += hairpinDirectionXml(hairpinStarts);
  }

  // Compute slur positions for this event
  const slurPositions: ("start" | "stop")[] = [];
  for (const a of annotations) {
    if (a.kind !== "slur") continue;
    if (a.startEventId === event.id) slurPositions.push("start");
    if (a.endEventId === event.id) slurPositions.push("stop");
  }

  const arts = (event.kind === "note" || event.kind === "chord" || event.kind === "grace")
    ? event.articulations : undefined;

  if (event.kind === "rest") {
    xml += `      <note>\n`;
    xml += `        <rest/>\n`;
    xml += durationXml(event.duration, tuplet);
    xml += `        <voice>${voiceNumber}</voice>\n${staffXml}`;
    xml += notationsXml(undefined, tupletPosition, slurPositions);
    xml += `      </note>\n`;
  } else if (event.kind === "grace") {
    xml += `      <note>\n`;
    xml += `        <grace${event.slash ? ' slash="yes"' : ''}/>\n`;
    xml += pitchXml(event.head.pitch);
    xml += durationXml(event.duration);
    xml += `        <voice>${voiceNumber}</voice>\n${staffXml}`;
    xml += accidentalXml(event.head.pitch);
    xml += notationsXml(undefined, undefined, undefined, arts);
    xml += `      </note>\n`;
  } else if (event.kind === "note") {
    const head = event.head;
    xml += `      <note>\n`;
    xml += pitchXml(head.pitch);
    xml += durationXml(event.duration, tuplet);
    xml += tieXml(head.tied, prevTied, false);
    xml += `        <voice>${voiceNumber}</voice>\n${staffXml}`;
    xml += beamXml(beamState, event.duration.type);
    xml += accidentalXml(head.pitch);
    xml += notationsXml(head.tied, tupletPosition, slurPositions, arts, prevTied);
    const lyrics = findLyricForEvent(annotations, event.id);
    xml += lyricXml(lyrics);
    xml += `      </note>\n`;
  } else if (event.kind === "chord") {
    const heads = event.heads;
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i];
      xml += `      <note>\n`;
      if (i > 0) {
        xml += `        <chord/>\n`;
      }
      xml += pitchXml(head.pitch);
      xml += durationXml(event.duration, tuplet);
      xml += tieXml(head.tied, i === 0 ? prevTied : undefined, i > 0);
      xml += `        <voice>${voiceNumber}</voice>\n${staffXml}`;
      xml += beamXml(beamState, event.duration.type);
      xml += accidentalXml(head.pitch);
      xml += notationsXml(head.tied, i === 0 ? tupletPosition : undefined, i === 0 ? slurPositions : undefined, i === 0 ? arts : undefined, i === 0 ? prevTied : undefined);
      if (i === 0) {
        const lyrics = findLyricForEvent(annotations, event.id);
        xml += lyricXml(lyrics);
      }
      xml += `      </note>\n`;
    }
  } else if (event.kind === "slash") {
    xml += `      <note>\n`;
    xml += `        <pitch>\n          <step>B</step>\n          <octave>4</octave>\n        </pitch>\n`;
    xml += durationXml(event.duration, tuplet);
    xml += `        <voice>${voiceNumber}</voice>\n${staffXml}`;
    xml += `        <notehead>slash</notehead>\n`;
    xml += notationsXml(undefined, tupletPosition, slurPositions);
    xml += `      </note>\n`;
  }

  // Emit hairpin stops after the note
  if (hairpinStops.length > 0) {
    xml += hairpinDirectionXml(hairpinStops);
  }

  return xml;
}

function exportMeasure(
  measure: Measure,
  measureNumber: number,
  isFirstMeasure: boolean,
  prevMeasure?: Measure,
  staveCount = 1,
  slashHint = false,
  tabHint = false,
): string {
  const xmlMeasureNum = measure.isPickup ? "0" : measureNumber;
  let xml = `    <measure number="${xmlMeasureNum}"${measure.isPickup ? ' implicit="yes"' : ""}>\n`;

  // Attributes — emit on first measure, or when clef/time/key change
  const needsAttributes =
    isFirstMeasure ||
    !prevMeasure ||
    prevMeasure.clef.type !== measure.clef.type ||
    prevMeasure.timeSignature.numerator !== measure.timeSignature.numerator ||
    prevMeasure.timeSignature.denominator !==
      measure.timeSignature.denominator ||
    prevMeasure.keySignature.fifths !== measure.keySignature.fifths;

  if (needsAttributes) {
    xml += `      <attributes>\n`;
    if (isFirstMeasure) {
      xml += `        <divisions>${MUSICXML_DIVISIONS}</divisions>\n`;
      if (staveCount >= 2) {
        xml += `        <staves>${staveCount}</staves>\n`;
      }
    }
    if (
      isFirstMeasure ||
      !prevMeasure ||
      prevMeasure.keySignature.fifths !== measure.keySignature.fifths
    ) {
      xml += `        <key>\n`;
      if (prevMeasure && prevMeasure.keySignature.fifths !== measure.keySignature.fifths) {
        xml += `          <cancel>${prevMeasure.keySignature.fifths}</cancel>\n`;
      }
      xml += `          <fifths>${measure.keySignature.fifths}</fifths>\n`;
      if (measure.keySignature.mode) {
        xml += `          <mode>${measure.keySignature.mode}</mode>\n`;
      }
      xml += `        </key>\n`;
    }
    if (
      isFirstMeasure ||
      !prevMeasure ||
      prevMeasure.timeSignature.numerator !==
        measure.timeSignature.numerator ||
      prevMeasure.timeSignature.denominator !==
        measure.timeSignature.denominator
    ) {
      xml += `        <time>\n`;
      xml += `          <beats>${measure.timeSignature.numerator}</beats>\n`;
      xml += `          <beat-type>${measure.timeSignature.denominator}</beat-type>\n`;
      xml += `        </time>\n`;
    }
    if (
      isFirstMeasure ||
      !prevMeasure ||
      prevMeasure.clef.type !== measure.clef.type
    ) {
      if (staveCount >= 2 && isFirstMeasure) {
        // Grand staff: treble on staff 1, bass on staff 2
        xml += `        <clef number="1">\n`;
        xml += `          <sign>G</sign>\n`;
        xml += `          <line>2</line>\n`;
        xml += `        </clef>\n`;
        xml += `        <clef number="2">\n`;
        xml += `          <sign>F</sign>\n`;
        xml += `          <line>4</line>\n`;
        xml += `        </clef>\n`;
      } else {
        const clefInfo = CLEF_TO_XML[measure.clef.type];
        xml += `        <clef>\n`;
        xml += `          <sign>${clefInfo.sign}</sign>\n`;
        xml += `          <line>${clefInfo.line}</line>\n`;
        xml += `        </clef>\n`;
      }
    }
    if (tabHint && isFirstMeasure) {
      xml += `        <staff-details>\n`;
      xml += `          <staff-type>tab</staff-type>\n`;
      xml += `        </staff-details>\n`;
    }
    if (slashHint && isFirstMeasure) {
      xml += `        <measure-style>\n`;
      xml += `          <slash type="start" use-stems="yes"/>\n`;
      xml += `        </measure-style>\n`;
    }
    xml += `      </attributes>\n`;
  }

  // Navigation marks (segno, coda, fine, D.S., D.C.)
  if (measure.navigation) {
    const nav = measure.navigation;
    if (nav.segno) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <segno/>\n        </direction-type>\n`;
      xml += `        <sound segno="segno"/>\n`;
      xml += `      </direction>\n`;
    }
    if (nav.coda) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <coda/>\n        </direction-type>\n`;
      xml += `        <sound coda="coda"/>\n`;
      xml += `      </direction>\n`;
    }
    if (nav.toCoda) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <words>To Coda</words>\n        </direction-type>\n`;
      xml += `      </direction>\n`;
    }
    if (nav.fine) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <words>Fine</words>\n        </direction-type>\n`;
      xml += `        <sound fine="yes"/>\n`;
      xml += `      </direction>\n`;
    }
    if (nav.dsText) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <words>${esc(nav.dsText)}</words>\n        </direction-type>\n`;
      xml += `        <sound dalsegno="segno"/>\n`;
      xml += `      </direction>\n`;
    }
    if (nav.dcText) {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n          <words>${esc(nav.dcText)}</words>\n        </direction-type>\n`;
      xml += `        <sound dacapo="yes"/>\n`;
      xml += `      </direction>\n`;
    }
  }

  // Rehearsal marks
  for (const ann of measure.annotations) {
    if (ann.kind === "rehearsal-mark") {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n`;
      xml += `          <rehearsal>${esc(ann.text)}</rehearsal>\n`;
      xml += `        </direction-type>\n`;
      xml += `      </direction>\n`;
    }
    if (ann.kind === "tempo-mark") {
      xml += `      <direction placement="above">\n`;
      xml += `        <direction-type>\n`;
      if (ann.text) {
        xml += `          <words>${esc(ann.text)}</words>\n`;
      }
      xml += `          <metronome>\n`;
      xml += `            <beat-unit>${ann.beatUnit}</beat-unit>\n`;
      xml += `            <per-minute>${ann.bpm}</per-minute>\n`;
      xml += `          </metronome>\n`;
      xml += `        </direction-type>\n`;
      xml += `        <sound tempo="${ann.bpm}"`;
      if (ann.swing && ann.swing.style !== "straight") {
        // MusicXML swing: first/second = ratio, swing-type = eighth or 16th
        const ratio = ann.swing.ratio ?? 2;
        const first = Math.round(ratio / (ratio + 1) * 100);
        const second = 100 - first;
        const swingType = ann.swing.subdivision === "sixteenth" ? "16th" : "eighth";
        xml += ` swing-type="${swingType}" swing-first="${first}" swing-second="${second}"`;
      } else if (ann.swing?.style === "straight") {
        xml += ` swing-type="eighth" swing-first="50" swing-second="50"`;
      }
      xml += `/>\n`;
      xml += `      </direction>\n`;
    }
  }

  // Collect chord symbols sorted by beat offset for interleaved export
  const chordSymbols = measure.annotations
    .filter((a): a is ChordSymbol => a.kind === "chord-symbol")
    .sort((a, b) => a.beatOffset - b.beatOffset);
  const emittedChords = new Set<string>();

  // Export voices
  for (let vi = 0; vi < measure.voices.length; vi++) {
    const voice = measure.voices[vi];
    const voiceNumber = vi + 1;

    // If this is not the first voice, we need a <backup> to reset position
    if (vi > 0) {
      // Calculate total duration of previous voice
      const prevVoice = measure.voices[vi - 1];
      let prevDuration = 0;
      for (const evt of prevVoice.events) {
        const evtTuplet = evt.tuplet;
        let divs = durationDivisions(evt.duration);
        if (evtTuplet) divs = Math.round((divs * evtTuplet.normal) / evtTuplet.actual);
        prevDuration += divs;
      }
      if (prevDuration > 0) {
        xml += `      <backup>\n`;
        xml += `        <duration>${prevDuration}</duration>\n`;
        xml += `      </backup>\n`;
      }
    }

    // Compute beam groups for this voice
    const events = voice.events;
    const beamGroups = getBeamGroups(events, measure.timeSignature);
    const beamStateMap = new Map<number, BeamState>();
    for (const group of beamGroups) {
      for (let gi = 0; gi < group.length; gi++) {
        const idx = group[gi];
        if (gi === 0) beamStateMap.set(idx, "begin");
        else if (gi === group.length - 1) beamStateMap.set(idx, "end");
        else beamStateMap.set(idx, "continue");
      }
    }

    // Determine tuplet start/stop positions for notation elements
    for (let ei = 0; ei < events.length; ei++) {
      const event = events[ei];
      const prevTuplet = ei > 0 ? events[ei - 1].tuplet : undefined;
      const nextTuplet = ei < events.length - 1 ? events[ei + 1].tuplet : undefined;
      const curTuplet = event.tuplet;

      let tupletPos: "start" | "stop" | undefined;
      if (curTuplet) {
        const isStart = !prevTuplet || prevTuplet.actual !== curTuplet.actual || prevTuplet.normal !== curTuplet.normal;
        const isStop = !nextTuplet || nextTuplet.actual !== curTuplet.actual || nextTuplet.normal !== curTuplet.normal;
        if (isStart && isStop) {
          tupletPos = "start";
        } else if (isStart) {
          tupletPos = "start";
        } else if (isStop) {
          tupletPos = "stop";
        }
      }

      // Emit chord symbols attached to this note
      for (const cs of chordSymbols) {
        if (cs.noteEventId === event.id && !emittedChords.has(cs.noteEventId)) {
          xml += harmonyXml([cs]);
          emittedChords.add(cs.noteEventId);
        }
      }

      // Check if previous note was tied (for tie stop)
      let prevWasTied = false;
      if (ei > 0) {
        const prev = events[ei - 1];
        if (prev.kind === "note") prevWasTied = !!prev.head.tied;
        else if (prev.kind === "chord") prevWasTied = prev.heads.some(h => h.tied);
      }
      const staffNum = staveCount >= 2 ? (voice.staff ?? 0) + 1 : undefined;
      xml += exportNoteEvent(event, voiceNumber, measure.annotations, tupletPos, prevWasTied, staffNum, beamStateMap.get(ei));

    }
  }

  // Barline and volta
  const hasVolta = measure.navigation?.volta;
  if (measure.barlineEnd !== "single" || hasVolta) {
    xml += `      <barline location="right">\n`;
    switch (measure.barlineEnd) {
      case "double":
        xml += `        <bar-style>light-light</bar-style>\n`;
        break;
      case "final":
        xml += `        <bar-style>light-heavy</bar-style>\n`;
        break;
      case "repeat-start":
        xml += `        <bar-style>heavy-light</bar-style>\n`;
        xml += `        <repeat direction="forward"/>\n`;
        break;
      case "repeat-end":
        xml += `        <bar-style>light-heavy</bar-style>\n`;
        xml += `        <repeat direction="backward"/>\n`;
        break;
    }
    if (hasVolta) {
      const volta = measure.navigation!.volta!;
      const number = volta.endings.join(",");
      const label = volta.label ?? volta.endings.join(", ") + ".";
      xml += `        <ending number="${number}" type="start">${esc(label)}</ending>\n`;
    }
    xml += `      </barline>\n`;
  }

  xml += `    </measure>\n`;
  return xml;
}

export function exportToMusicXML(score: Score, viewConfig?: ViewConfig): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n`;
  xml += `<score-partwise version="4.0">\n`;

  // Work title
  if (score.title) {
    xml += `  <work>\n`;
    xml += `    <work-title>${esc(score.title)}</work-title>\n`;
    xml += `  </work>\n`;
  }

  // Identification
  {
    const hasIdBlock = score.composer || viewConfig;
    if (hasIdBlock) xml += `  <identification>\n`;
    if (score.composer) {
      xml += `    <creator type="composer">${esc(score.composer)}</creator>\n`;
    }
    if (viewConfig) {
      xml += `    <miscellaneous>\n`;
      xml += `      <miscellaneous-field name="nubium-view-config">${esc(JSON.stringify(viewConfig))}</miscellaneous-field>\n`;
      xml += `    </miscellaneous>\n`;
    }
    if (hasIdBlock) xml += `  </identification>\n`;
  }

  // Part list
  xml += `  <part-list>\n`;
  for (let i = 0; i < score.parts.length; i++) {
    const part = score.parts[i];
    const partId = `P${i + 1}`;
    xml += `    <score-part id="${partId}">\n`;
    xml += `      <part-name>${esc(part.name)}</part-name>\n`;
    if (part.abbreviation) {
      xml += `      <part-name-display>\n`;
      xml += `        <display-text>${esc(part.abbreviation)}</display-text>\n`;
      xml += `      </part-name-display>\n`;
    }
    xml += `    </score-part>\n`;
  }
  xml += `  </part-list>\n`;

  // Parts
  for (let i = 0; i < score.parts.length; i++) {
    const part = score.parts[i];
    const partId = `P${i + 1}`;
    xml += `  <part id="${partId}">\n`;

    const instrument = getInstrument(part.instrumentId);
    const staveCount = instrument?.staves ?? 1;
    // Never write display-mode hints — MusicXML can't roundtrip all view states,
    // and it's better to show extra (standard view) than hide something the user had visible.
    // Slash/tab data is always preserved in <notehead> and note content.
    const slashHint = false;
    const tabHint = false;

    for (let m = 0; m < part.measures.length; m++) {
      const prevMeasure = m > 0 ? part.measures[m - 1] : undefined;
      xml += exportMeasure(part.measures[m], m + 1, m === 0, prevMeasure, staveCount, slashHint, tabHint);
    }

    xml += `  </part>\n`;
  }

  xml += `</score-partwise>\n`;
  return xml;
}
