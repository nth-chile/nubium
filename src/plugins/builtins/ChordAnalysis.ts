import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import type { Score } from "../../model";
import type { NoteEvent } from "../../model/note";
import type { ChordSymbol } from "../../model/annotations";
import { pitchToMidi } from "../../model/pitch";
import type { PitchClass } from "../../model/pitch";

const NOTE_NAMES: PitchClass[] = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface ChordTemplate {
  name: string;
  intervals: number[];
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  { name: "maj", intervals: [0, 4, 7] },
  { name: "min", intervals: [0, 3, 7] },
  { name: "dim", intervals: [0, 3, 6] },
  { name: "aug", intervals: [0, 4, 8] },
  { name: "maj7", intervals: [0, 4, 7, 11] },
  { name: "7", intervals: [0, 4, 7, 10] },
  { name: "min7", intervals: [0, 3, 7, 10] },
  { name: "sus4", intervals: [0, 5, 7] },
  { name: "sus2", intervals: [0, 2, 7] },
];

function identifyChord(midiNotes: number[]): string | null {
  if (midiNotes.length < 2) return null;

  const pitchClasses = [...new Set(midiNotes.map((m) => m % 12))].sort((a, b) => a - b);
  if (pitchClasses.length < 2) return null;

  // Try each pitch class as root
  for (const root of pitchClasses) {
    const intervals = pitchClasses.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);

    for (const template of CHORD_TEMPLATES) {
      if (template.intervals.length !== intervals.length) continue;
      if (template.intervals.every((v, i) => v === intervals[i])) {
        const rootName = SHARP_NAMES[root];
        const suffix = template.name === "maj" ? "" : template.name;
        return rootName + suffix;
      }
    }
  }

  return null;
}

function getMidiFromEvents(events: NoteEvent[]): number[] {
  const midis: number[] = [];
  for (const ev of events) {
    if (ev.kind === "note") {
      midis.push(pitchToMidi(ev.head.pitch));
    } else if (ev.kind === "chord") {
      for (const head of ev.heads) {
        midis.push(pitchToMidi(head.pitch));
      }
    }
  }
  return midis;
}

export const ChordAnalysisPlugin: NotationPlugin = {
  id: "notation.chord-analysis",
  name: "Chord Analysis",
  version: "1.0.0",
  description: "Analyze note groups and add chord symbols",

  activate(api: PluginAPI) {
    api.registerCommand("notation.analyze-chords", "Analyze Chords", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      let chordsAdded = 0;

      for (let pi = 0; pi < score.parts.length; pi++) {
        if (selection && pi !== selection.partIndex) continue;
        const part = score.parts[pi];

        for (let mi = 0; mi < part.measures.length; mi++) {
          if (selection && (mi < selection.measureStart || mi > selection.measureEnd)) continue;
          const measure = part.measures[mi];

          // Collect all notes in the measure
          const allEvents: NoteEvent[] = [];
          for (const voice of measure.voices) {
            allEvents.push(...voice.events);
          }

          const midis = getMidiFromEvents(allEvents);
          const chordName = identifyChord(midis);

          if (chordName) {
            // Remove existing chord symbols at beat 0
            measure.annotations = measure.annotations.filter(
              (a) => !(a.kind === "chord-symbol" && a.beatOffset === 0)
            );
            const chordSymbol: ChordSymbol = {
              kind: "chord-symbol",
              text: chordName,
              beatOffset: 0,
            };
            measure.annotations.push(chordSymbol);
            chordsAdded++;
          }
        }
      }

      api.applyScore(score);
      api.showNotification(`Analyzed ${chordsAdded} chord(s)`, "success");
    });
  },
};

export { identifyChord };
