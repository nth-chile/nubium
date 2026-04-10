import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import type { Score, Part, Measure } from "../../model/score";
import type { NoteEvent, Articulation, NoteHead } from "../../model/note";
import type { Duration, DurationType } from "../../model/duration";
import type { Tuning } from "../../model/guitar";
import type { Clef, BarlineType } from "../../model/time";
import { newId, type ScoreId, type PartId, type MeasureId, type VoiceId, type NoteEventId } from "../../model/ids";
import { midiToPitch } from "../../model/pitch";

function gpDurToOurs(d: string): DurationType {
  const map: Record<string, DurationType> = {
    whole: "whole", half: "half", quarter: "quarter", eighth: "eighth",
    "16th": "16th", "32nd": "32nd", "64th": "64th",
  };
  return map[d] ?? "quarter";
}

function convertNote(
  note: { string: number; fret: number; pitchClass: number; noteName: string;
    slide: number | null; harmonic: string | null; palmMute: boolean; muted: boolean;
    letRing: boolean; bend: { origin: number; destination: number; middle: number } | null;
    tie: { origin: boolean; destination: boolean }; vibrato: string | null;
    hammerOn: boolean; pullOff: boolean; tapped: boolean; accent: number | null },
  tuningMidi: number[],
): { head: NoteHead; articulations: Articulation[]; tabInfo: { string: number; fret: number } } {
  // tuningMidi[0] = highest string, matching note.string (0-indexed in GP, but let's check)
  const stringIdx = note.string;
  const openMidi = tuningMidi[stringIdx] ?? 64;
  const midi = openMidi + note.fret;
  const pitch = midiToPitch(midi);

  const arts: Articulation[] = [];

  // Bends
  if (note.bend) {
    const { origin, destination, middle } = note.bend;
    if (origin === 0 && destination > 0 && middle === 0) {
      // Normal bend up
      const semitones = Math.round(destination / 50); // GP uses 0-200 scale (200 = full tone = 2 semitones)
      arts.push({ kind: "bend", semitones: Math.max(1, semitones) });
    } else if (origin > 0 && destination === origin) {
      // Pre-bend (already bent)
      const semitones = Math.round(origin / 50);
      arts.push({ kind: "pre-bend", semitones: Math.max(1, semitones) });
    } else if (origin === 0 && destination === 0 && middle > 0) {
      // Bend-release
      const semitones = Math.round(middle / 50);
      arts.push({ kind: "bend-release", semitones: Math.max(1, semitones) });
    } else if (destination > 0) {
      const semitones = Math.round(destination / 50);
      arts.push({ kind: "bend", semitones: Math.max(1, semitones) });
    }
  }

  if (note.slide !== null) {
    if (note.slide > 0) arts.push({ kind: "slide-up" });
    else arts.push({ kind: "slide-down" });
  }
  if (note.hammerOn) arts.push({ kind: "hammer-on" });
  if (note.pullOff) arts.push({ kind: "pull-off" });
  if (note.vibrato) arts.push({ kind: "vibrato" });
  if (note.palmMute) arts.push({ kind: "palm-mute" });
  if (note.muted) arts.push({ kind: "dead-note" });
  if (note.letRing) arts.push({ kind: "let-ring" });
  if (note.tapped) arts.push({ kind: "tapping" });
  if (note.harmonic) arts.push({ kind: "harmonic" });
  if (note.accent && note.accent > 0) arts.push({ kind: "accent" });

  const tabInfo = { string: note.string + 1, fret: note.fret }; // GP is 0-indexed, ours is 1-indexed

  return {
    head: { pitch, tabInfo },
    articulations: arts,
    tabInfo,
  };
}

function convertBeat(
  beat: { notes: any[]; duration: string; tuplet: { num: number; den: number } | null;
    dotted: number; isRest: boolean; dynamic: string | null },
  tuningMidi: number[],
): NoteEvent {
  const dur: Duration = {
    type: gpDurToOurs(beat.duration),
    dots: (beat.dotted || 0) as 0 | 1 | 2 | 3,
  };

  if (beat.isRest || beat.notes.length === 0) {
    return {
      kind: "rest" as const,
      id: newId<NoteEventId>("evt"),
      duration: dur,
    };
  }

  const tuplet = beat.tuplet ? { actual: beat.tuplet.num, normal: beat.tuplet.den } : undefined;

  if (beat.notes.length === 1) {
    const { head, articulations, tabInfo } = convertNote(beat.notes[0], tuningMidi);
    return {
      kind: "note" as const,
      id: newId<NoteEventId>("evt"),
      duration: dur,
      head,
      tabInfo,
      articulations: articulations.length > 0 ? articulations : undefined,
      tuplet,
    };
  }

  // Multiple notes = chord
  const allArts: Articulation[] = [];
  const heads: NoteHead[] = [];
  for (const n of beat.notes) {
    const { head, articulations } = convertNote(n, tuningMidi);
    heads.push(head);
    for (const a of articulations) {
      if (!allArts.some((e) => e.kind === a.kind)) allArts.push(a);
    }
  }

  return {
    kind: "chord" as const,
    id: newId<NoteEventId>("evt"),
    duration: dur,
    heads,
    articulations: allArts.length > 0 ? allArts : undefined,
    tuplet,
  };
}

function guessClef(tuningMidi: number[]): Clef {
  // If the average open string pitch is below middle C (60), use bass clef
  const avg = tuningMidi.reduce((a, b) => a + b, 0) / tuningMidi.length;
  return { type: avg < 50 ? "bass" : "treble" };
}

function convertTrack(
  track: { id: string; name: string; shortName: string; tuning: any[]; tuningMidi: number[]; capoFret: number; bars: any[] },
  _defaultTempo: number,
): Part {
  const clef = guessClef(track.tuningMidi);
  // Convert tuningMidi to our tuning format (low to high)
  const tuning: Tuning = {
    name: "Custom",
    strings: [...track.tuningMidi].reverse(), // GP: high to low, ours: low to high
  };

  const measures: Measure[] = track.bars.map((bar, idx) => {
    const events: NoteEvent[] = bar.beats.map((beat: any) => convertBeat(beat, track.tuningMidi));

    let barlineEnd: BarlineType = "single";
    if (bar.repeatEnd) barlineEnd = "repeat-end";
    else if (idx === track.bars.length - 1) barlineEnd = "final";

    const measure: Measure = {
      id: newId<MeasureId>("m"),
      clef,
      timeSignature: {
        numerator: bar.timeSignature.numerator,
        denominator: bar.timeSignature.denominator,
      },
      keySignature: bar.keySignature
        ? { fifths: bar.keySignature.mode === "minor" ? -bar.keySignature.accidentalCount : bar.keySignature.accidentalCount }
        : { fifths: 0 },
      barlineEnd,
      annotations: [],
      voices: [{
        id: newId<VoiceId>("v"),
        events,
      }],
    };

    // Repeat barlines
    if (bar.repeatStart) {
      measure.barlineEnd = idx > 0 ? measure.barlineEnd : "single";
      // We handle repeat-start as a separate barline concept
      // For now, if both repeat-start and repeat-end, use repeat-both
      if (bar.repeatStart && bar.repeatEnd) {
        measure.barlineEnd = "repeat-both" as BarlineType;
      } else if (bar.repeatStart && idx > 0) {
        // Set previous measure's end barline to repeat-start... but we don't have access
        // Instead, mark this measure. Our model doesn't have barlineStart, so we approximate.
      }
    }

    // Section markers as rehearsal marks
    if (bar.section) {
      measure.annotations.push({
        kind: "rehearsal-mark" as const,
        text: bar.section.letter || bar.section.text || "",
      });
    }

    return measure;
  });

  return {
    id: newId<PartId>("p"),
    name: track.name || "Guitar",
    abbreviation: track.shortName || "Gtr.",
    instrumentId: clef.type === "bass" ? "bass" : "guitar",
    muted: false,
    solo: false,
    measures,
    tuning,
    capo: track.capoFret || undefined,
  };
}

function convertSong(song: { title: string; artist: string; tempo: number; tracks: any[] }): Score {
  return {
    id: newId<ScoreId>("s"),
    title: song.title || "Untitled",
    composer: song.artist || "",
    formatVersion: 1,
    tempo: song.tempo || 120,
    parts: song.tracks.map((t) => convertTrack(t, song.tempo)),
  };
}

export const GuitarProImportPlugin: NubiumPlugin = {
  id: "nubium.gp-import",
  name: "Guitar Pro Import",
  version: "1.0.0",
  description: "Import Guitar Pro files (.gp, .gp3, .gp5, .gpx)",

  activate(api: PluginAPI) {
    api.registerImporter("gp-import", {
      name: "Guitar Pro",
      extensions: [".gp", ".gp3", ".gp4", ".gp5", ".gpx"],
      import: (_content: string) => {
        // This won't be called directly — GP files are binary.
        // We register a command instead that handles the binary file read.
        throw new Error("Use the import command for binary Guitar Pro files");
      },
    });

    api.registerCommand("nubium.import-gp", "Import Guitar Pro File", async () => {
      try {
        let data: Uint8Array;
        let fileName: string;

        try {
          // Tauri native file dialog
          const { open } = await import("@tauri-apps/plugin-dialog");
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const path = await open({
            filters: [{ name: "Guitar Pro", extensions: ["gp", "gp3", "gp4", "gp5", "gpx"] }],
          });
          if (!path) return;
          fileName = path as string;
          data = await readFile(fileName);
        } catch {
          // Browser fallback
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".gp,.gp3,.gp4,.gp5,.gpx";
          const file = await new Promise<File | null>((resolve) => {
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
          });
          if (!file) return;
          fileName = file.name;
          data = new Uint8Array(await file.arrayBuffer());
        }

        const { parseTabFile } = await import("guitarpro-parser");
        const song = parseTabFile(data, fileName);
        const score = convertSong(song);
        api.applyScore(score);
        api.showNotification(`Imported "${score.title}" (${score.parts.length} tracks)`, "success");
      } catch (err) {
        api.showNotification(`GP import failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    });
  },
};
