import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import type { Score, Measure, Voice } from "../../model/score";
import type { NoteEvent } from "../../model/note";
import type { Pitch } from "../../model/pitch";
import type { Duration, DurationType } from "../../model/duration";
import { importFromMusicXML } from "../../musicxml/import";
import { exportToMusicXML } from "../../musicxml/export";
import { factory } from "../../model";
import { newId } from "../../model/ids";

// --- ABC Notation ---

const ABC_DURATION: Record<DurationType, string> = {
  whole: "4",
  half: "2",
  quarter: "",
  eighth: "/2",
  "16th": "/4",
  "32nd": "/8",
  "64th": "/16",
};

function pitchToAbc(p: Pitch): string {
  let acc = "";
  if (p.accidental === "sharp") acc = "^";
  else if (p.accidental === "double-sharp") acc = "^^";
  else if (p.accidental === "flat") acc = "_";
  else if (p.accidental === "double-flat") acc = "__";

  // ABC: C is octave 4, c is octave 5, C, is octave 3, c' is octave 6
  const letter = p.pitchClass;
  if (p.octave >= 5) {
    let note = acc + letter.toLowerCase();
    for (let i = 6; i <= p.octave; i++) note += "'";
    return note;
  } else {
    let note = acc + letter;
    for (let i = 3; i >= p.octave; i--) note += ",";
    return note;
  }
}

function eventToAbc(event: NoteEvent): string {
  const dur = ABC_DURATION[event.duration.type] + (event.duration.dots > 0 ? ">" : "");

  if (event.kind === "rest") return "z" + dur;
  if (event.kind === "note") return pitchToAbc(event.head.pitch) + dur;
  if (event.kind === "chord") {
    const pitches = event.heads.map((h) => pitchToAbc(h.pitch)).join("");
    return "[" + pitches + "]" + dur;
  }
  return "z" + dur; // slash → rest
}

function measureToAbc(measure: Measure): string {
  const voice = measure.voices[0];
  if (!voice) return "";
  return voice.events.map(eventToAbc).join(" ");
}

function scoreToAbc(score: Score): string {
  const lines: string[] = [];
  lines.push("X:1");
  if (score.title) lines.push(`T:${score.title}`);
  if (score.composer) lines.push(`C:${score.composer}`);

  const firstMeasure = score.parts[0]?.measures[0];
  if (firstMeasure) {
    const ts = firstMeasure.timeSignature;
    lines.push(`M:${ts.numerator}/${ts.denominator}`);
    const ks = firstMeasure.keySignature;
    lines.push(`K:${keySignatureToAbc(ks.fifths)}`);
  }

  lines.push(`Q:1/4=${score.tempo}`);

  for (const part of score.parts) {
    const measures = part.measures.map(measureToAbc);
    lines.push(measures.join(" | ") + " |]");
  }

  return lines.join("\n");
}

const KEY_NAMES = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
function keySignatureToAbc(fifths: number): string {
  return KEY_NAMES[fifths + 7] ?? "C";
}

// --- LilyPond ---

const LILY_DURATION: Record<DurationType, string> = {
  whole: "1",
  half: "2",
  quarter: "4",
  eighth: "8",
  "16th": "16",
  "32nd": "32",
  "64th": "64",
};

function pitchToLily(p: Pitch): string {
  let note = p.pitchClass.toLowerCase();
  if (p.accidental === "sharp") note += "is";
  else if (p.accidental === "double-sharp") note += "isis";
  else if (p.accidental === "flat") note += "es";
  else if (p.accidental === "double-flat") note += "eses";

  // LilyPond: c' = C4 (middle C)
  if (p.octave >= 4) {
    for (let i = 4; i < p.octave; i++) note += "'";
  } else {
    for (let i = 3; i >= p.octave; i--) note += ",";
  }
  return note;
}

function eventToLily(event: NoteEvent): string {
  const dur = LILY_DURATION[event.duration.type] + ".".repeat(event.duration.dots);

  if (event.kind === "rest") return "r" + dur;
  if (event.kind === "note") return pitchToLily(event.head.pitch) + dur;
  if (event.kind === "chord") {
    const pitches = event.heads.map((h) => pitchToLily(h.pitch)).join(" ");
    return "<" + pitches + ">" + dur;
  }
  return "r" + dur;
}

function measureToLily(measure: Measure): string {
  const voice = measure.voices[0];
  if (!voice) return "";
  return voice.events.map(eventToLily).join(" ");
}

function scoreToLily(score: Score): string {
  const lines: string[] = [];

  lines.push("\\version \"2.24.0\"");
  if (score.title) lines.push(`\\header { title = "${score.title}" }`);
  lines.push(`\\tempo 4 = ${score.tempo}`);

  for (const part of score.parts) {
    const firstMeasure = part.measures[0];
    const measures = part.measures.map(measureToLily).join(" | ");
    let staff = "\\new Staff {";
    if (firstMeasure) {
      const ts = firstMeasure.timeSignature;
      staff += ` \\time ${ts.numerator}/${ts.denominator}`;
    }
    lines.push(staff);
    lines.push("  " + measures);
    lines.push("}");
  }

  return lines.join("\n");
}

// --- ABC Parsing (import) ---

function abcPitchToModel(token: string): { pitch: Pitch; rest: string } {
  let i = 0;
  let accidental: Pitch["accidental"] = "natural";

  // Accidentals
  if (token[i] === "^" && token[i + 1] === "^") { accidental = "double-sharp"; i += 2; }
  else if (token[i] === "^") { accidental = "sharp"; i += 1; }
  else if (token[i] === "_" && token[i + 1] === "_") { accidental = "double-flat"; i += 2; }
  else if (token[i] === "_") { accidental = "flat"; i += 1; }

  const letter = token[i];
  i++;
  const isLower = letter === letter.toLowerCase();
  const pitchClass = letter.toUpperCase() as Pitch["pitchClass"];

  let octave = isLower ? 5 : 4;
  while (i < token.length && token[i] === "'") { octave++; i++; }
  while (i < token.length && token[i] === ",") { octave--; i++; }

  return {
    pitch: { pitchClass, accidental, octave: Math.max(0, Math.min(9, octave)) as Pitch["octave"] },
    rest: token.slice(i),
  };
}

const ABC_DUR_MAP: Record<string, DurationType> = {
  "4": "whole",
  "3": "half", // dotted half approximation
  "2": "half",
  "": "quarter",
  "/2": "eighth",
  "/4": "16th",
  "/8": "32nd",
  "/16": "64th",
};

function parseAbcDuration(s: string): Duration {
  // Strip dotted marker
  const dots = s.includes(">") ? 1 : 0;
  const clean = s.replace(">", "");
  const type = ABC_DUR_MAP[clean] ?? "quarter";
  return { type, dots: dots as Duration["dots"] };
}

function parseAbcToScore(abc: string): Score {
  const lines = abc.split("\n");
  let title = "";
  let tempo = 120;
  const musicLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("T:")) title = line.slice(2).trim();
    else if (line.startsWith("Q:")) {
      const m = line.match(/=(\d+)/);
      if (m) tempo = parseInt(m[1]);
    }
    else if (!line.match(/^[A-Z]:/)) musicLines.push(line);
  }

  const score = factory.emptyScore();
  score.title = title;
  score.tempo = tempo;
  const part = score.parts[0];
  part.measures = [];

  const music = musicLines.join(" ");
  const bars = music.split(/\|+/).filter((b) => b.trim());

  for (const bar of bars) {
    const measure = factory.measure([factory.voice([])]);
    const voice = measure.voices[0];
    voice.events = [];

    const tokens = bar.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token.startsWith("z") || token.startsWith("Z")) {
        const durStr = token.slice(1);
        voice.events.push({
          kind: "rest",
          id: newId("evt"),
          duration: parseAbcDuration(durStr),
        });
      } else if (token.startsWith("[")) {
        // Chord
        const closeIdx = token.indexOf("]");
        const inner = token.slice(1, closeIdx);
        const durStr = token.slice(closeIdx + 1);
        const heads: { pitch: Pitch; tied?: boolean }[] = [];
        let rest = inner;
        while (rest.length > 0 && /[A-Ga-g^_]/.test(rest[0])) {
          const result = abcPitchToModel(rest);
          heads.push({ pitch: result.pitch });
          rest = result.rest;
        }
        if (heads.length > 0) {
          voice.events.push({
            kind: "chord",
            id: newId("evt"),
            duration: parseAbcDuration(durStr),
            heads,
          });
        }
      } else if (/[A-Ga-g^_]/.test(token[0])) {
        const result = abcPitchToModel(token);
        const durStr = result.rest;
        voice.events.push({
          kind: "note",
          id: newId("evt"),
          duration: parseAbcDuration(durStr),
          head: { pitch: result.pitch },
        });
      }
    }

    if (voice.events.length > 0) {
      part.measures.push(measure);
    }
  }

  if (part.measures.length === 0) {
    part.measures.push(factory.measure([factory.voice([])]));
  }

  return score;
}

// --- Format Detection ---

function detectFormat(text: string): "abc" | "lilypond" | "musicxml" | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<score-partwise")) return "musicxml";
  if (trimmed.startsWith("X:") || trimmed.match(/^[A-Z]:\s*/m)) return "abc";
  if (trimmed.includes("\\version") || trimmed.includes("\\new Staff") || trimmed.includes("\\relative")) return "lilypond";
  return null;
}

// --- Exports for testing ---

export { scoreToAbc, scoreToLily, parseAbcToScore, detectFormat, pitchToAbc, pitchToLily, eventToAbc, eventToLily };

// --- Plugin ---

export const ClipboardPlugin: NubiumPlugin = {
  id: "nubium.clipboard",
  name: "Clipboard Interop",
  version: "1.0.0",
  description: "Copy score as ABC/LilyPond/MusicXML text, paste notation from clipboard",

  activate(api: PluginAPI) {
    function getScoreOrSelection(): Score {
      const score = api.getScore();
      const sel = api.getSelection();
      if (!sel) return score;

      // Extract only selected measures
      const part = score.parts[sel.partIndex];
      if (!part) return score;
      const selectedMeasures = part.measures.slice(sel.measureStart, sel.measureEnd + 1);
      return {
        ...score,
        parts: [{ ...part, measures: selectedMeasures }],
      };
    }

    api.registerCommand("nubium.copy-abc", "Copy as ABC Notation", async () => {
      const abc = scoreToAbc(getScoreOrSelection());
      await navigator.clipboard.writeText(abc);
    });

    api.registerCommand("nubium.copy-lilypond", "Copy as LilyPond", async () => {
      const lily = scoreToLily(getScoreOrSelection());
      await navigator.clipboard.writeText(lily);
    });

    api.registerCommand("nubium.copy-musicxml", "Copy as MusicXML", async () => {
      const xml = exportToMusicXML(getScoreOrSelection());
      await navigator.clipboard.writeText(xml);
    });

    api.registerCommand("nubium.paste-notation", "Paste Notation", async () => {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;

      const format = detectFormat(text);
      let score: Score | null = null;

      if (format === "musicxml") {
        score = importFromMusicXML(text);
      } else if (format === "abc") {
        score = parseAbcToScore(text);
      } else if (format === "lilypond") {
        // LilyPond parsing is very complex — not supported for paste yet
        return;
      }

      if (score) {
        api.applyScore(score);
      }
    });
  },
};
