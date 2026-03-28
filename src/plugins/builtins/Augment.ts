import type { NotationPlugin, PluginAPI } from "../PluginAPI";
import type { Score } from "../../model";
import type { NoteEvent } from "../../model/note";
import type { DurationType } from "../../model/duration";

const DURATION_ORDER: DurationType[] = ["64th", "32nd", "16th", "eighth", "quarter", "half", "whole"];

function changeDurationLevel(event: NoteEvent, direction: "augment" | "diminish"): NoteEvent {
  const idx = DURATION_ORDER.indexOf(event.duration.type);
  if (idx < 0) return event;

  const newIdx = direction === "augment" ? idx + 1 : idx - 1;
  if (newIdx < 0 || newIdx >= DURATION_ORDER.length) return event;

  return {
    ...event,
    duration: { ...event.duration, type: DURATION_ORDER[newIdx] },
  };
}

function transformScore(
  score: Score,
  direction: "augment" | "diminish",
  selection: { partIndex: number; measureStart: number; measureEnd: number } | null
): Score {
  const result = structuredClone(score);

  for (let pi = 0; pi < result.parts.length; pi++) {
    if (selection && pi !== selection.partIndex) continue;
    const part = result.parts[pi];

    for (let mi = 0; mi < part.measures.length; mi++) {
      if (selection && (mi < selection.measureStart || mi > selection.measureEnd)) continue;
      const measure = part.measures[mi];

      for (const voice of measure.voices) {
        voice.events = voice.events.map((ev) => changeDurationLevel(ev, direction));
      }
    }
  }

  return result;
}

export const AugmentPlugin: NotationPlugin = {
  id: "notation.augment",
  name: "Augment / Diminish",
  version: "1.0.0",
  description: "Double or halve note durations",

  activate(api: PluginAPI) {
    api.registerCommand("notation.augment", "Augment (Double Durations)", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      const newScore = transformScore(score, "augment", selection);
      api.applyScore(newScore);
      api.showNotification("Durations doubled", "success");
    });

    api.registerCommand("notation.diminish", "Diminish (Halve Durations)", () => {
      const score = api.getScore();
      const selection = api.getSelection();
      const newScore = transformScore(score, "diminish", selection);
      api.applyScore(newScore);
      api.showNotification("Durations halved", "success");
    });
  },
};

export { transformScore, changeDurationLevel };
