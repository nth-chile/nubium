import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import type { Score } from "../../model";

function retrogradeScore(score: Score, selection: { partIndex: number; measureStart: number; measureEnd: number } | null): Score {
  const result = structuredClone(score);

  for (let pi = 0; pi < result.parts.length; pi++) {
    if (selection && pi !== selection.partIndex) continue;
    const part = result.parts[pi];

    for (let mi = 0; mi < part.measures.length; mi++) {
      if (selection && (mi < selection.measureStart || mi > selection.measureEnd)) continue;
      const measure = part.measures[mi];

      for (const voice of measure.voices) {
        voice.events = voice.events.slice().reverse();
      }
    }
  }

  return result;
}

export const RetrogradePlugin: NotationPlugin = {
  id: "notation.retrograde",
  name: "Retrograde",
  version: "1.0.0",
  description: "Reverse the order of notes in selection or entire score",

  activate(api: PluginAPI) {
    api.registerCommand("notation.retrograde", "Retrograde (Reverse Notes)", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      const newScore = retrogradeScore(score, selection);
      api.applyScore(newScore);
      api.showNotification("Notes reversed", "success");
    });
  },
};

export { retrogradeScore };
