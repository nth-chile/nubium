import type { Score, Part, Measure, Voice } from "../model/score";
import type { NoteEvent, NoteHead, TupletRatio } from "../model/note";
import type { Pitch } from "../model/pitch";
import type { Duration } from "../model/duration";
import type { Annotation, ChordSymbol, Lyric, DynamicMark, Hairpin, Slur } from "../model/annotations";
import { durationToTicks } from "../model/duration";
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

function tieXml(tied: boolean | undefined, isChordTag: boolean): string {
  if (!tied) return "";
  // For tied notes, we emit tie start. A complete implementation would track
  // stop ties as well, but for basic export, start is sufficient.
  let xml = "";
  if (!isChordTag) {
    xml += `        <tie type="start"/>\n`;
  }
  return xml;
}

function notationsXml(tied: boolean | undefined, tupletPosition?: "start" | "stop", slurPositions?: ("start" | "stop")[]): string {
  if (!tied && !tupletPosition && (!slurPositions || slurPositions.length === 0)) return "";
  let xml = `        <notations>\n`;
  if (tied) {
    xml += `          <tied type="start"/>\n`;
  }
  if (tupletPosition) {
    xml += `          <tuplet type="${tupletPosition}"/>\n`;
  }
  if (slurPositions) {
    for (const pos of slurPositions) {
      xml += `          <slur type="${pos}"/>\n`;
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
    // Kind — store full text as "other" for now since chord symbol parsing is complex
    const kindText = text.slice(kindStart);
    xml += `        <kind text="${esc(kindText)}">other</kind>\n`;
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
  tupletPosition?: "start" | "stop"
): string {
  let xml = "";
  const tuplet = event.tuplet;

  // Emit dynamics attached to this event
  const dynamics = annotations.filter(
    (a): a is DynamicMark => a.kind === "dynamic" && a.noteEventId === event.id
  );
  if (dynamics.length > 0) {
    xml += dynamicDirectionXml(dynamics);
  }

  // Emit hairpin starts/stops at this event
  const hairpinEvents: { hairpin: Hairpin; position: "start" | "stop" }[] = [];
  for (const a of annotations) {
    if (a.kind !== "hairpin") continue;
    if (a.startEventId === event.id) hairpinEvents.push({ hairpin: a, position: "start" });
    if (a.endEventId === event.id) hairpinEvents.push({ hairpin: a, position: "stop" });
  }
  if (hairpinEvents.length > 0) {
    xml += hairpinDirectionXml(hairpinEvents);
  }

  // Compute slur positions for this event
  const slurPositions: ("start" | "stop")[] = [];
  for (const a of annotations) {
    if (a.kind !== "slur") continue;
    if (a.startEventId === event.id) slurPositions.push("start");
    if (a.endEventId === event.id) slurPositions.push("stop");
  }

  if (event.kind === "rest") {
    xml += `      <note>\n`;
    xml += `        <rest/>\n`;
    xml += durationXml(event.duration, tuplet);
    xml += `        <voice>${voiceNumber}</voice>\n`;
    xml += notationsXml(undefined, tupletPosition, slurPositions);
    xml += `      </note>\n`;
  } else if (event.kind === "note") {
    const head = event.head;
    xml += `      <note>\n`;
    xml += pitchXml(head.pitch);
    xml += durationXml(event.duration, tuplet);
    xml += tieXml(head.tied, false);
    xml += `        <voice>${voiceNumber}</voice>\n`;
    xml += accidentalXml(head.pitch);
    xml += notationsXml(head.tied, tupletPosition, slurPositions);
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
      xml += tieXml(head.tied, i > 0);
      xml += `        <voice>${voiceNumber}</voice>\n`;
      xml += accidentalXml(head.pitch);
      xml += notationsXml(head.tied, i === 0 ? tupletPosition : undefined, i === 0 ? slurPositions : undefined);
      if (i === 0) {
        const lyrics = findLyricForEvent(annotations, event.id);
        xml += lyricXml(lyrics);
      }
      xml += `      </note>\n`;
    }
  }

  return xml;
}

function exportMeasure(
  measure: Measure,
  measureNumber: number,
  isFirstMeasure: boolean,
  prevMeasure?: Measure
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
    }
    if (
      isFirstMeasure ||
      !prevMeasure ||
      prevMeasure.keySignature.fifths !== measure.keySignature.fifths
    ) {
      xml += `        <key>\n`;
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
      const clefInfo = CLEF_TO_XML[measure.clef.type];
      xml += `        <clef>\n`;
      xml += `          <sign>${clefInfo.sign}</sign>\n`;
      xml += `          <line>${clefInfo.line}</line>\n`;
      xml += `        </clef>\n`;
    }
    xml += `      </attributes>\n`;
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
      xml += `        <sound tempo="${ann.bpm}"/>\n`;
      xml += `      </direction>\n`;
    }
  }

  // Chord symbols (harmony elements come before notes at their position)
  const chordSymbols = measure.annotations.filter(
    (a): a is ChordSymbol => a.kind === "chord-symbol"
  );
  if (chordSymbols.length > 0) {
    xml += harmonyXml(chordSymbols);
  }

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

    // Determine tuplet start/stop positions for notation elements
    const events = voice.events;
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
          // Single-event tuplet: emit start, then we'd need a separate stop but MusicXML
          // expects start on first and stop on last. For a single note, emit start.
          tupletPos = "start";
        } else if (isStart) {
          tupletPos = "start";
        } else if (isStop) {
          tupletPos = "stop";
        }
      }

      xml += exportNoteEvent(event, voiceNumber, measure.annotations, tupletPos);
    }
  }

  // Barline
  if (measure.barlineEnd !== "single") {
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
    xml += `      </barline>\n`;
  }

  xml += `    </measure>\n`;
  return xml;
}

export function exportToMusicXML(score: Score): string {
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
  if (score.composer) {
    xml += `  <identification>\n`;
    xml += `    <creator type="composer">${esc(score.composer)}</creator>\n`;
    xml += `  </identification>\n`;
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

    for (let m = 0; m < part.measures.length; m++) {
      const prevMeasure = m > 0 ? part.measures[m - 1] : undefined;
      xml += exportMeasure(part.measures[m], m + 1, m === 0, prevMeasure);
    }

    xml += `  </part>\n`;
  }

  xml += `</score-partwise>\n`;
  return xml;
}
