import type { NubiumPlugin, PluginAPI } from "../PluginAPI";
import type { Score } from "../../model";
import type { NoteEvent } from "../../model/note";
import { pitchToMidi, midiToPitch } from "../../model/pitch";

function transposeEvent(event: NoteEvent, semitones: number): NoteEvent {
  if (event.kind === "note") {
    const midi = pitchToMidi(event.head.pitch);
    const newMidi = Math.max(0, Math.min(127, midi + semitones));
    return {
      ...event,
      head: { ...event.head, pitch: midiToPitch(newMidi) },
    };
  }
  if (event.kind === "chord") {
    return {
      ...event,
      heads: event.heads.map((h) => {
        const midi = pitchToMidi(h.pitch);
        const newMidi = Math.max(0, Math.min(127, midi + semitones));
        return { ...h, pitch: midiToPitch(newMidi) };
      }),
    };
  }
  return event;
}

function transposeScore(score: Score, semitones: number, selection: { partIndex: number; measureStart: number; measureEnd: number } | null): Score {
  const result = structuredClone(score);

  for (let pi = 0; pi < result.parts.length; pi++) {
    if (selection && pi !== selection.partIndex) continue;
    const part = result.parts[pi];

    for (let mi = 0; mi < part.measures.length; mi++) {
      if (selection && (mi < selection.measureStart || mi > selection.measureEnd)) continue;
      const measure = part.measures[mi];

      for (const voice of measure.voices) {
        voice.events = voice.events.map((ev) => transposeEvent(ev, semitones));
      }
    }
  }

  return result;
}

export const TransposePlugin: NubiumPlugin = {
  id: "nubium.transpose",
  name: "Transpose",
  version: "1.0.0",
  description: "Transpose notes by various intervals",

  activate(api: PluginAPI) {
    const commands: Array<[string, string, number, string]> = [
      ["nubium.transpose-up", "Transpose Up (Half Step)", 1, "up by a half step"],
      ["nubium.transpose-down", "Transpose Down (Half Step)", -1, "down by a half step"],
      ["nubium.transpose-up-whole", "Transpose Up (Whole Step)", 2, "up by a whole step"],
      ["nubium.transpose-down-whole", "Transpose Down (Whole Step)", -2, "down by a whole step"],
      ["nubium.transpose-up-minor3", "Transpose Up (Minor 3rd)", 3, "up by a minor 3rd"],
      ["nubium.transpose-up-major3", "Transpose Up (Major 3rd)", 4, "up by a major 3rd"],
      ["nubium.transpose-up-perfect4", "Transpose Up (Perfect 4th)", 5, "up by a perfect 4th"],
      ["nubium.transpose-up-perfect5", "Transpose Up (Perfect 5th)", 7, "up by a perfect 5th"],
      ["nubium.transpose-up-octave", "Transpose Up (Octave)", 12, "up by an octave"],
      ["nubium.transpose-down-octave", "Transpose Down (Octave)", -12, "down by an octave"],
    ];

    for (const [id, label, semitones, desc] of commands) {
      api.registerCommand(id, label, () => {
        const score = api.getScore();
        const selection = api.getSelection();
        const newScore = transposeScore(score, semitones, selection);
        api.applyScore(newScore);
        api.showNotification(`Transposed ${desc}`, "success");
      });
    }
  },
};

// Export the transpose function for testing
export { transposeScore, transposeEvent };
