import type { NotationPlugin, PluginAPI } from "../PluginAPI";
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

export const TransposePlugin: NotationPlugin = {
  id: "notation.transpose",
  name: "Transpose",
  version: "1.0.0",
  description: "Transpose notes up or down by a half step",

  activate(api: PluginAPI) {
    api.registerCommand("notation.transpose-up", "Transpose Up (Half Step)", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      const newScore = transposeScore(score, 1, selection);
      api.applyScore(newScore);
      api.showNotification("Transposed up by a half step", "success");
    });

    api.registerCommand("notation.transpose-down", "Transpose Down (Half Step)", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      const newScore = transposeScore(score, -1, selection);
      api.applyScore(newScore);
      api.showNotification("Transposed down by a half step", "success");
    });
  },
};

// Export the transpose function for testing
export { transposeScore, transposeEvent };
